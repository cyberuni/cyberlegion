import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it } from 'vitest'

// Exercises `cyberlegion init` end-to-end over the built CLI entrypoint (bin → dist/cli.mjs), the
// same pattern cli.e2e.test.ts uses — an isolated --space hub root per test.
const BIN = fileURLToPath(new URL('../bin/cyberlegion.mjs', import.meta.url))

let space: string
beforeEach(() => {
	space = join(mkdtempSync(join(tmpdir(), 'cl-e2e-init-')), 'hub')
})

// Strip mux + harness-detection env so each test controls detection precisely.
const MUX_ENV_KEYS = [
	'TMUX',
	'TMUX_PANE',
	'HERDR_ENV',
	'HERDR_PANE_ID',
	'CYBER_MUX',
	'CYBER_MUX_PANE',
	'CYBERLEGION_MUX',
	'CYBERLEGION_MUX_PANE',
]
function baseEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
	const merged = { ...process.env, ...env }
	for (const k of Object.keys(merged)) {
		const isHarnessKey =
			k === 'CLAUDECODE' || k === 'CLAUDE_CODE_ENTRYPOINT' || k.startsWith('CURSOR') || k.startsWith('CODEX')
		if ((MUX_ENV_KEYS.includes(k) || isHarnessKey) && !(k in env)) delete merged[k]
	}
	return merged
}

function legion(args: string[], env: NodeJS.ProcessEnv = {}): string {
	return execFileSync('node', [BIN, ...args, '--space', space], { encoding: 'utf8', env: baseEnv(env) })
}

function legionOut(args: string[], env: NodeJS.ProcessEnv = {}): { stdout: string; stderr: string; status: number } {
	const res = spawnSync('node', [BIN, ...args, '--space', space], { encoding: 'utf8', env: baseEnv(env) })
	return { stdout: res.stdout, stderr: res.stderr, status: res.status ?? 0 }
}

function freshProjectDir(): string {
	return mkdtempSync(join(tmpdir(), 'cl-init-'))
}

const readCfg = (dir: string, rel: string) => JSON.parse(readFileSync(join(dir, rel), 'utf8'))

const PATH_FIRST =
	'if command -v cyberlegion >/dev/null 2>&1; then cyberlegion mail hook --event SessionStart; else npx -y cyberlegion mail hook --event SessionStart; fi'

describe('init resolves the harness and leaves the hook to the plugin where it ships one', () => {
	it('auto-detects claude, writes no project hook, and reports provided by plugin', () => {
		const dir = freshProjectDir()
		const out = legion(['init', '--dir', dir], { CLAUDECODE: '1' })
		expect(existsSync(join(dir, '.claude/settings.json'))).toBe(false)
		expect(out).toContain('provided by plugin')
		expect(out).toContain('harness claude')
	})

	it('codex reports SessionStart as provided by plugin, and no PostToolUse', () => {
		const dir = freshProjectDir()
		const out = JSON.parse(legion(['init', '--agent', 'codex', '--dir', dir, '--format', 'json']))
		expect(out.hooks.map((h: { event: string; status: string }) => [h.event, h.status])).toEqual([
			['SessionStart', 'provided by plugin'],
		])
		expect(existsSync(join(dir, '.codex/hooks.json'))).toBe(false)
	})

	it('auto-detects cursor and registers the PATH-first SessionStart hook, with no PostToolUse', () => {
		const dir = freshProjectDir()
		legion(['init', '--dir', dir], { CURSOR_TRACE_ID: '1' })
		const cfg = readCfg(dir, '.cursor/hooks.json')
		expect(cfg.hooks.sessionStart[0].command).toBe(PATH_FIRST)
		expect(cfg.hooks.PostToolUse).toBeUndefined()
	})
})

describe('init installs into the directory named by --dir', () => {
	it('writes into the target directory, not the current one', () => {
		const target = freshProjectDir()
		legion(['init', '--agent', 'cursor', '--dir', target])
		expect(existsSync(join(target, '.cursor/hooks.json'))).toBe(true)
	})
})

describe('an explicit --agent overrides detection', () => {
	it('registers into cursor config even though env would detect claude', () => {
		const dir = freshProjectDir()
		legion(['init', '--agent', 'cursor', '--dir', dir], { CLAUDECODE: '1' })
		expect(existsSync(join(dir, '.cursor/hooks.json'))).toBe(true)
		expect(existsSync(join(dir, '.claude/settings.json'))).toBe(false)
	})
})

describe('an unrecognized --agent is rejected', () => {
	it('throws naming the allowed values', () => {
		const dir = freshProjectDir()
		const res = legionOut(['init', '--agent', 'grok', '--dir', dir])
		expect(res.status).not.toBe(0)
		expect(res.stderr).toMatch(/claude.*cursor.*codex/i)
	})
})

describe('an undetectable harness with no --agent throws rather than guessing', () => {
	it('throws asking for --agent and writes no harness config', () => {
		const dir = freshProjectDir()
		const res = legionOut(['init', '--dir', dir])
		expect(res.status).not.toBe(0)
		expect(res.stderr).toMatch(/--agent/)
		expect(existsSync(join(dir, '.claude'))).toBe(false)
		expect(existsSync(join(dir, '.cursor'))).toBe(false)
		expect(existsSync(join(dir, '.codex'))).toBe(false)
	})
})

describe('init points at owner binding when none is bound', () => {
	it('emits a bind-owner next-step when no standing owner exists', () => {
		const dir = freshProjectDir()
		const res = legionOut(['init', '--agent', 'claude', '--dir', dir])
		expect(res.status).toBe(0)
		expect(res.stderr).toMatch(/unit register --standing/)
		expect(res.stderr).toMatch(/attach/)
	})
})

describe('init emits no bind-owner next-step when a standing owner already exists', () => {
	it('does not advise binding when a standing owner is already present', () => {
		legion(['unit', 'register', '--standing', '--handle', 'legate'])
		const dir = freshProjectDir()
		const res = legionOut(['init', '--agent', 'claude', '--dir', dir])
		expect(res.status).toBe(0)
		expect(res.stderr).not.toMatch(/unit register --standing/)
		expect(res.stderr).not.toMatch(/attach/)
	})
})

describe('init never mints an owner or binds a pane itself', () => {
	it('leaves the registry and main pane untouched after a successful run', () => {
		const dir = freshProjectDir()
		legion(['init', '--agent', 'claude', '--dir', dir])
		const standing = JSON.parse(legion(['unit', 'register', '--standing', '--format', 'json'])) as unknown[]
		expect(standing).toHaveLength(0)
		expect(legion(['attach', '--show'])).toContain('mainPane: none')
	})
})

describe('re-running init does not duplicate the hook entry', () => {
	it('reports already present on the second run', () => {
		const dir = freshProjectDir()
		legion(['init', '--agent', 'cursor', '--dir', dir])
		const second = legion(['init', '--agent', 'cursor', '--dir', dir])
		expect(second).toContain('already present')
		expect(readCfg(dir, '.cursor/hooks.json').hooks.sessionStart).toHaveLength(1)
	})
})

describe('init removes a project hook an earlier init wrote where the plugin ships the hook', () => {
	it('drops the earlier claude entry, keeps an unrelated hook, and reports removed project hook', () => {
		const dir = freshProjectDir()
		mkdirSync(join(dir, '.claude'))
		writeFileSync(
			join(dir, '.claude/settings.json'),
			JSON.stringify({
				hooks: {
					SessionStart: [
						{ hooks: [{ type: 'command', command: 'npx cyberlegion@0.2.0 mail hook --event SessionStart' }] },
						{ hooks: [{ type: 'command', command: 'echo unrelated' }] },
					],
				},
			}),
		)
		const out = legion(['init', '--agent', 'claude', '--dir', dir])
		expect(out).toContain('removed project hook')
		expect(readCfg(dir, '.claude/settings.json').hooks.SessionStart).toEqual([
			{ hooks: [{ type: 'command', command: 'echo unrelated' }] },
		])
	})
})
