import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { install, validatePin } from './install.ts'

let dir: string
beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), 'cl-'))
})

const readCfg = (rel: string) => JSON.parse(readFileSync(join(dir, rel), 'utf8'))

describe('per-vendor registration', () => {
	it('registers SessionStart for every harness under its own event name', () => {
		install('claude', dir)
		install('cursor', dir)
		install('codex', dir)
		expect(readCfg('.claude/settings.json').hooks.SessionStart[0].hooks[0].command).toBe(
			'npx cyberlegion mail hook --event SessionStart',
		)
		expect(readCfg('.cursor/hooks.json').hooks.sessionStart[0].command).toBe(
			'npx cyberlegion mail hook --event SessionStart',
		)
		expect(readCfg('.codex/hooks.json').hooks.SessionStart[0].command).toBe(
			'npx cyberlegion mail hook --event SessionStart',
		)
	})

	it('registers PostToolUse only for Claude and Codex, not Cursor', () => {
		install('claude', dir)
		install('cursor', dir)
		install('codex', dir)
		expect(readCfg('.claude/settings.json').hooks.PostToolUse).toBeDefined()
		expect(readCfg('.codex/hooks.json').hooks.PostToolUse).toBeDefined()
		expect(readCfg('.cursor/hooks.json').hooks.PostToolUse).toBeUndefined()
	})
})

describe('pinned registration', () => {
	it('registers a version-pinned npx command when --pin is given', () => {
		install('claude', dir, '0.2.0')
		expect(readCfg('.claude/settings.json').hooks.SessionStart[0].hooks[0].command).toBe(
			'npx cyberlegion@0.2.0 mail hook --event SessionStart',
		)
	})

	it.each(['0.2.0', '1.2.3-rc.1+build.5', 'latest', 'next'])('accepts the version-or-dist-tag pin %j', (pin) => {
		expect(() => install('claude', dir, pin)).not.toThrow()
		expect(readCfg('.claude/settings.json').hooks.SessionStart[0].hooks[0].command).toBe(
			`npx cyberlegion@${pin} mail hook --event SessionStart`,
		)
	})

	it.each([
		'',
		' ',
		'1.2.3 ',
		'>=1 <2',
		'1.2.3 && rm -rf /',
		'0.2.0; echo hi',
		'a@b',
		'x/y',
	])('rejects the malformed pin %j and writes no config', (pin) => {
		expect(() => install('claude', dir, pin)).toThrow(/invalid --pin/)
		expect(existsSync(join(dir, '.claude/settings.json'))).toBe(false)
	})

	it('validatePin accepts a concrete version and throws on a range', () => {
		expect(() => validatePin('0.2.0')).not.toThrow()
		expect(() => validatePin('^1.0.0')).toThrow(/invalid --pin/)
	})
})

describe('idempotent registration', () => {
	it('does not duplicate on re-register', () => {
		install('claude', dir)
		const second = install('claude', dir)
		expect(second.every((r) => r.status === 'already present')).toBe(true)
		expect(readCfg('.claude/settings.json').hooks.SessionStart).toHaveLength(1)
	})

	it('rewrites a legacy bare-command entry to the npx form in place', () => {
		const file = join(dir, '.claude/settings.json')
		mkdirSync(join(dir, '.claude'), { recursive: true })
		writeFileSync(
			file,
			JSON.stringify({
				hooks: {
					SessionStart: [{ hooks: [{ type: 'command', command: 'cyberlegion mail hook --event SessionStart' }] }],
				},
			}),
		)
		const results = install('claude', dir)
		expect(readCfg('.claude/settings.json').hooks.SessionStart).toHaveLength(1)
		expect(readCfg('.claude/settings.json').hooks.SessionStart[0].hooks[0].command).toBe(
			'npx cyberlegion mail hook --event SessionStart',
		)
		expect(results.find((r) => r.event === 'SessionStart')?.status).toBe('already present')
	})
})
