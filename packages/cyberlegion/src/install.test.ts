import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { install, validatePin } from './install.ts'

let dir: string
beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), 'cl-'))
})

const readCfg = (rel: string) => JSON.parse(readFileSync(join(dir, rel), 'utf8'))
const writeCfg = (rel: string, data: unknown) => {
	mkdirSync(join(dir, rel, '..'), { recursive: true })
	writeFileSync(join(dir, rel), JSON.stringify(data))
}

const pathFirst = (event: string, pin?: string) =>
	`if command -v cyberlegion >/dev/null 2>&1; then cyberlegion mail hook --event ${event}; else npx -y cyberlegion${pin ? `@${pin}` : ''} mail hook --event ${event}; fi`

describe('harnesses whose plugin ships the hook', () => {
	it.each(['claude', 'codex'] as const)('%s gets no project hook and reports provided by plugin', (harness) => {
		const results = install(harness, dir)
		expect(results.map((r) => [r.event, r.status])).toEqual([['SessionStart', 'provided by plugin']])
	})

	it.each([
		['claude', '.claude/settings.json'],
		['codex', '.codex/hooks.json'],
	] as const)('%s creates no config file when none exists', (harness, file) => {
		install(harness, dir)
		expect(existsSync(join(dir, file))).toBe(false)
	})

	it.each([
		'cyberlegion mail hook --event SessionStart',
		'npx cyberlegion mail hook --event SessionStart',
		'npx cyberlegion@0.2.0 mail hook --event SessionStart',
	])('removes the earlier claude project hook %j and keeps unrelated hooks', (command) => {
		writeCfg('.claude/settings.json', {
			hooks: {
				SessionStart: [
					{ hooks: [{ type: 'command', command }] },
					{ hooks: [{ type: 'command', command: 'echo unrelated' }] },
				],
			},
			model: 'opus',
		})
		const results = install('claude', dir)
		const cfg = readCfg('.claude/settings.json')
		expect(cfg.hooks.SessionStart).toEqual([{ hooks: [{ type: 'command', command: 'echo unrelated' }] }])
		expect(cfg.model).toBe('opus')
		expect(results.find((r) => r.event === 'SessionStart')?.status).toBe('removed project hook')
		expect(results.find((r) => r.event === 'PostToolUse')).toBeUndefined()
	})

	// PostToolUse is retired: no hook fires on it any more, and `mail hook` rejects it. A project hook an
	// earlier init wrote for it is still removed, so it is not left calling a rejected event.
	it.each(['npx cyberlegion mail hook --event PostToolUse', pathFirst('PostToolUse', '0.2.0')])(
		'removes the retired claude PostToolUse project hook %j and keeps unrelated hooks',
		(command) => {
			const unrelated = { matcher: 'Write|Edit', hooks: [{ type: 'command', command: 'echo unrelated' }] }
			writeCfg('.claude/settings.json', {
				hooks: { PostToolUse: [{ matcher: 'Write|Edit', hooks: [{ type: 'command', command }] }, unrelated] },
			})
			const results = install('claude', dir)
			expect(readCfg('.claude/settings.json').hooks.PostToolUse).toEqual([unrelated])
			expect(results.map((r) => [r.event, r.status])).toEqual([
				['SessionStart', 'provided by plugin'],
				['PostToolUse', 'removed project hook'],
			])
		},
	)

	it('drops a claude PostToolUse key left empty after removing the retired hook', () => {
		writeCfg('.claude/settings.json', {
			hooks: {
				PostToolUse: [
					{
						matcher: 'Write|Edit',
						hooks: [{ type: 'command', command: 'npx cyberlegion mail hook --event PostToolUse' }],
					},
				],
			},
		})
		install('claude', dir)
		expect(readCfg('.claude/settings.json').hooks.PostToolUse).toBeUndefined()
	})

	it('removes the retired codex PostToolUse project hook and keeps unrelated ones', () => {
		writeCfg('.codex/hooks.json', {
			version: 1,
			hooks: { PostToolUse: [{ command: 'npx cyberlegion mail hook --event PostToolUse' }, { command: 'x' }] },
		})
		const results = install('codex', dir)
		expect(readCfg('.codex/hooks.json').hooks.PostToolUse).toEqual([{ command: 'x' }])
		expect(results.find((r) => r.event === 'PostToolUse')?.status).toBe('removed project hook')
	})

	it("leaves the user's own PostToolUse hook alone and reports nothing for it", () => {
		const command = 'my-wrapper && cyberlegion mail hook --event PostToolUse'
		writeCfg('.claude/settings.json', { hooks: { PostToolUse: [{ hooks: [{ type: 'command', command }] }] } })
		const results = install('claude', dir)
		expect(readCfg('.claude/settings.json').hooks.PostToolUse[0].hooks[0].command).toBe(command)
		expect(results.map((r) => r.event)).toEqual(['SessionStart'])
	})

	it('removes the earlier codex project hook', () => {
		writeCfg('.codex/hooks.json', {
			version: 1,
			hooks: { SessionStart: [{ command: 'npx cyberlegion@0.3.1 mail hook --event SessionStart' }, { command: 'x' }] },
		})
		const results = install('codex', dir)
		expect(readCfg('.codex/hooks.json').hooks.SessionStart).toEqual([{ command: 'x' }])
		expect(results.find((r) => r.event === 'SessionStart')?.status).toBe('removed project hook')
	})

	it.each([
		'my-wrapper && cyberlegion mail hook --event SessionStart',
		'cyberlegion mail hook --event SessionStart --format json',
	])("never removes the user's own hook %j", (command) => {
		writeCfg('.claude/settings.json', { hooks: { SessionStart: [{ hooks: [{ type: 'command', command }] }] } })
		const results = install('claude', dir)
		expect(readCfg('.claude/settings.json').hooks.SessionStart[0].hooks[0].command).toBe(command)
		expect(results.find((r) => r.event === 'SessionStart')?.status).toBe('provided by plugin')
	})

	it('leaves a hook for another event alone', () => {
		writeCfg('.claude/settings.json', {
			hooks: { SessionStart: [{ hooks: [{ type: 'command', command: 'cyberlegion mail inbox' }] }] },
		})
		install('claude', dir)
		expect(readCfg('.claude/settings.json').hooks.SessionStart).toHaveLength(1)
	})
})

describe('cursor: a PATH-first project hook', () => {
	it('registers SessionStart under its own event key, with no PostToolUse', () => {
		const results = install('cursor', dir)
		const cfg = readCfg('.cursor/hooks.json')
		expect(cfg.version).toBe(1)
		expect(cfg.hooks.sessionStart).toEqual([{ command: pathFirst('SessionStart') }])
		expect(cfg.hooks.PostToolUse).toBeUndefined()
		expect(results).toHaveLength(1)
		expect(results[0]?.status).toBe('registered')
	})

	it('pins only the npx fallback when --pin is given', () => {
		install('cursor', dir, '0.2.0')
		expect(readCfg('.cursor/hooks.json').hooks.sessionStart[0].command).toBe(pathFirst('SessionStart', '0.2.0'))
	})

	it.each(['0.2.0', '1.2.3-rc.1+build.5', 'latest', 'next'])('accepts the version-or-dist-tag pin %j', (pin) => {
		expect(() => install('cursor', dir, pin)).not.toThrow()
		expect(readCfg('.cursor/hooks.json').hooks.sessionStart[0].command).toBe(pathFirst('SessionStart', pin))
	})

	it.each(['', ' ', '1.2.3 ', '>=1 <2', '1.2.3 && rm -rf /', '0.2.0; echo hi', 'a@b', 'x/y'])(
		'rejects the malformed pin %j and writes no config',
		(pin) => {
			expect(() => install('cursor', dir, pin)).toThrow(/invalid --pin/)
			expect(existsSync(join(dir, '.cursor/hooks.json'))).toBe(false)
		},
	)

	it('rejects a malformed pin for a plugin-hook harness too', () => {
		expect(() => install('claude', dir, '1 2')).toThrow(/invalid --pin/)
	})

	it('validatePin accepts a concrete version and throws on a range', () => {
		expect(() => validatePin('0.2.0')).not.toThrow()
		expect(() => validatePin('^1.0.0')).toThrow(/invalid --pin/)
	})

	it('does not duplicate on re-register', () => {
		install('cursor', dir)
		const second = install('cursor', dir)
		expect(second.every((r) => r.status === 'already present')).toBe(true)
		expect(readCfg('.cursor/hooks.json').hooks.sessionStart).toHaveLength(1)
	})

	it.each([
		'cyberlegion mail hook --event SessionStart',
		'npx cyberlegion mail hook --event SessionStart',
		'npx cyberlegion@0.1.0 mail hook --event SessionStart',
		pathFirst('SessionStart', '0.1.0'),
	])('rewrites the older generation %j in place', (command) => {
		writeCfg('.cursor/hooks.json', { version: 1, hooks: { sessionStart: [{ command }, { command: 'echo other' }] } })
		const results = install('cursor', dir, '0.2.0')
		expect(readCfg('.cursor/hooks.json').hooks.sessionStart).toEqual([
			{ command: pathFirst('SessionStart', '0.2.0') },
			{ command: 'echo other' },
		])
		expect(results[0]?.status).toBe('already present')
	})

	it.each([
		['fails', 'exit 3', 3],
		['succeeds', 'exit 0', 0],
	])('runs only the PATH copy when it %s, never also npx', (_, body, code) => {
		install('cursor', dir)
		const bin = mkdtempSync(join(tmpdir(), 'cl-bin-'))
		const marker = join(bin, 'npx-ran')
		const script = (name: string, text: string) => {
			writeFileSync(join(bin, name), `#!/bin/sh\n${text}\n`)
			chmodSync(join(bin, name), 0o755)
		}
		script('cyberlegion', body)
		script('npx', `touch '${marker}'`)
		const res = spawnSync('/bin/sh', ['-c', readCfg('.cursor/hooks.json').hooks.sessionStart[0].command], {
			env: { PATH: `${bin}:/usr/bin:/bin` },
		})
		expect(res.status).toBe(code)
		expect(existsSync(marker)).toBe(false)
	})

	it('falls back to npx when no cyberlegion is on PATH', () => {
		install('cursor', dir)
		const bin = mkdtempSync(join(tmpdir(), 'cl-bin-'))
		writeFileSync(join(bin, 'npx'), '#!/bin/sh\necho "npx $*"\n')
		chmodSync(join(bin, 'npx'), 0o755)
		const res = spawnSync('/bin/sh', ['-c', readCfg('.cursor/hooks.json').hooks.sessionStart[0].command], {
			env: { PATH: `${bin}:/usr/bin:/bin` },
			encoding: 'utf8',
		})
		expect(res.stdout).toBe('npx -y cyberlegion mail hook --event SessionStart\n')
	})
})
