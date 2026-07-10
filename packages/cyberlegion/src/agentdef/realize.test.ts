import { describe, expect, it } from 'vitest'
import { realizeLaunch, shellQuote } from './realize.ts'
import type { AgentDef } from './resolve.ts'

function def(overrides: Partial<AgentDef> = {}): AgentDef {
	return {
		name: 'reviewer',
		instructions: 'Look for correctness bugs first.',
		path: '/tmp/reviewer.md',
		...overrides,
	}
}

describe('shellQuote', () => {
	it('wraps a plain value in single quotes', () => {
		expect(shellQuote('sonnet')).toBe("'sonnet'")
	})

	it('escapes an embedded single quote safely', () => {
		expect(shellQuote(`it's fine`)).toBe(`'it'\\''s fine'`)
	})
})

describe('realizeLaunch', () => {
	it('applies the def model + instructions for a claude harness', () => {
		const res = realizeLaunch(def({ model: 'sonnet', harness: 'claude' }))
		expect(res.harness).toBe('claude')
		expect(res.command).toBe(`claude --model 'sonnet' --append-system-prompt 'Look for correctness bugs first.'`)
	})

	it('maps cursor and codex to their own launch binaries', () => {
		expect(realizeLaunch(def({ model: 'opus', harness: 'cursor' })).command).toContain('cursor-agent')
		expect(realizeLaunch(def({ model: 'opus', harness: 'codex' })).command).toContain('codex ')
	})

	it('defaults to claude when neither the def nor an override sets a harness', () => {
		expect(realizeLaunch(def()).harness).toBe('claude')
	})

	it('an explicit model/harness override wins over the def', () => {
		const res = realizeLaunch(def({ model: 'sonnet', harness: 'claude' }), { model: 'opus', harness: 'codex' })
		expect(res.harness).toBe('codex')
		expect(res.command).toContain("--model 'opus'")
	})

	it('omits --model entirely when neither the def nor an override sets one', () => {
		const res = realizeLaunch(def({ harness: 'claude' }))
		expect(res.command).not.toContain('--model')
	})

	it('safely quotes instructions containing shell-special characters', () => {
		const res = realizeLaunch(def({ instructions: `don't leak "quotes"; $(rm -rf /)`, harness: 'claude' }))
		expect(res.command).toContain(shellQuote(`don't leak "quotes"; $(rm -rf /)`))
	})
})
