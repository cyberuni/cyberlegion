import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { install } from './install.ts'

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
			'cyberlegion mail hook --event SessionStart',
		)
		expect(readCfg('.cursor/hooks.json').hooks.sessionStart[0].command).toBe(
			'cyberlegion mail hook --event SessionStart',
		)
		expect(readCfg('.codex/hooks.json').hooks.SessionStart[0].command).toBe(
			'cyberlegion mail hook --event SessionStart',
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

describe('idempotent registration', () => {
	it('does not duplicate on re-register', () => {
		install('claude', dir)
		const second = install('claude', dir)
		expect(second.every((r) => r.status === 'already present')).toBe(true)
		expect(readCfg('.claude/settings.json').hooks.SessionStart).toHaveLength(1)
	})
})
