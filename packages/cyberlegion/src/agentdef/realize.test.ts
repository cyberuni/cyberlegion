import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { realizeLaunch, resolveSpawnLaunch, shellQuote } from './realize.ts'
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

// spec: agent/agent.feature — a def's effort travels through each harness's own effort control.
describe('spec:cyberlegion/agent realizeLaunch effort', () => {
	it.each([
		['claude', 'sonnet', `--effort 'high'`],
		['codex', 'gpt-5', `-c 'model_reasoning_effort="high"'`],
		['cursor', 'gpt-5', `--model 'gpt-5[effort=high]'`],
	] as const)('carries a %s def effort in that harness own effort control', (harness, model, control) => {
		expect(realizeLaunch(def({ harness, model, effort: 'high' })).command).toContain(control)
	})

	it.each(['claude', 'codex', 'cursor'] as const)('a %s def with no effort carries no effort control', (harness) => {
		const { command } = realizeLaunch(def({ harness, model: 'gpt-5' }))
		expect(command).not.toContain('--effort')
		expect(command).not.toContain('model_reasoning_effort')
		expect(command).not.toContain('effort=')
	})

	it.each([
		['claude-opus-4-8[context=1m]', 'claude-opus-4-8[context=1m,effort=high]'],
		['claude-opus-4-8[effort=low]', 'claude-opus-4-8[effort=high]'],
		['gpt-5[context=1m,effort=low]', 'gpt-5[context=1m,effort=high]'],
	])('merges a cursor effort into the bracket parameters of %s', (model, realized) => {
		const { command } = realizeLaunch(def({ harness: 'cursor', model, effort: 'high' }))
		expect(command).toContain(`--model ${shellQuote(realized)}`)
	})

	it('a cursor effort with no model throws naming cursor and the missing model', () => {
		let result: unknown
		expect(() => {
			result = realizeLaunch(def({ harness: 'cursor', effort: 'high' }))
		}).toThrow(/cursor.*model/)
		expect(result).toBeUndefined()
	})
})

// spec: unit/lifecycle/lifecycle.feature — `--agent` resolves a def whose harness/model/
// instructions compose the launch, and an explicit `--harness` overrides the def's own. These bind
// the RESOLUTION WIRE: realizeLaunch and resolveAgentDef were each well covered, but nothing
// exercised the join, so replacing the whole resolution with a constant left the suite green.
describe('spec:cyberlegion/unit/lifecycle resolveSpawnLaunch', () => {
	function defFile(fm: string, instructions: string): string {
		const dir = mkdtempSync(join(tmpdir(), 'cl-def-'))
		const file = join(dir, 'reviewer.md')
		writeFileSync(file, `---\n${fm}\n---\n\n${instructions}\n`)
		return file
	}

	it('--agent resolves a def whose harness, model and instructions compose the launch', () => {
		const file = defFile('name: reviewer\nharness: claude\nmodel: sonnet', 'Look for correctness bugs first.')
		const res = resolveSpawnLaunch({ agentFile: file })
		expect(res.harness).toBe('claude')
		expect(res.command).toContain('claude')
		expect(res.command).toContain("'sonnet'") // the def's model
		expect(res.command).toContain('Look for correctness bugs first.') // the def's instructions
	})

	it('an explicit --harness overrides the resolved def own harness', () => {
		const file = defFile('name: reviewer\nharness: claude\nmodel: sonnet', 'Look for correctness bugs first.')
		expect(resolveSpawnLaunch({ agentFile: file, harness: 'codex' }).harness).toBe('codex')
	})

	it('passes a bare --harness straight through when no def is named', () => {
		expect(resolveSpawnLaunch({ harness: 'cursor' })).toEqual({ harness: 'cursor' })
	})
})
