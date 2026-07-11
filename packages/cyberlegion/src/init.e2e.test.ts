import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
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
const MUX_ENV_KEYS = ['TMUX', 'TMUX_PANE', 'HERDR_ENV', 'HERDR_PANE_ID', 'CYBERLEGION_MUX', 'CYBERLEGION_MUX_PANE']
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

describe('init resolves the harness and registers the SessionStart hook', () => {
	it('auto-detects claude and reports the resolved harness', () => {
		const dir = freshProjectDir()
		const out = legion(['init', '--dir', dir], { CLAUDECODE: '1' })
		expect(readCfg(dir, '.claude/settings.json').hooks.SessionStart[0].hooks[0].command).toBe(
			'npx cyberlegion mail hook --event SessionStart',
		)
		expect(out).toContain('harness claude')
	})
})

describe('init registers PostToolUse only where the resolved harness supports it', () => {
	it('claude gets PostToolUse; cursor does not', () => {
		const claudeDir = freshProjectDir()
		legion(['init', '--dir', claudeDir], { CLAUDECODE: '1' })
		expect(readCfg(claudeDir, '.claude/settings.json').hooks.PostToolUse).toBeDefined()

		const cursorDir = freshProjectDir()
		legion(['init', '--dir', cursorDir], { CURSOR_TRACE_ID: '1' })
		expect(readCfg(cursorDir, '.cursor/hooks.json').hooks.PostToolUse).toBeUndefined()
	})
})

describe('init installs into the directory named by --dir', () => {
	it('writes into the target directory, not the current one', () => {
		const target = freshProjectDir()
		legion(['init', '--agent', 'claude', '--dir', target])
		expect(existsSync(join(target, '.claude/settings.json'))).toBe(true)
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
		legion(['init', '--agent', 'claude', '--dir', dir])
		const second = legion(['init', '--agent', 'claude', '--dir', dir])
		expect(second).toContain('already present')
		expect(readCfg(dir, '.claude/settings.json').hooks.SessionStart).toHaveLength(1)
	})
})
