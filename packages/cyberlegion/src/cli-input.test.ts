import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readCommandOutput, spawnCommandInput } from './cli-input.ts'

function defFile(fm: string, instructions: string): string {
	const file = join(mkdtempSync(join(tmpdir(), 'cl-def-')), 'reviewer.md')
	writeFileSync(file, `---\n${fm}\n---\n\n${instructions}\n`)
	return file
}

// spec: unit/lifecycle/lifecycle.feature — the option wires behind `unit spawn` and `unit read`.
// Their frozen Givens say "a caller running unit spawn …", but the entrypoint is a module-scope
// parseAsync with no exports and spawn needs a live multiplexer, so nothing reached these
// translations: an option silently dropped — or forwarded inverted — changed real behavior green.
describe('spec:cyberlegion/unit/lifecycle spawn command options', () => {
	it('--agent resolves a def whose harness, model and instructions compose the launch', () => {
		const file = defFile('name: reviewer\nharness: claude\nmodel: sonnet', 'Look for correctness bugs first.')
		const { input } = spawnCommandInput({ agentFile: file, task: 't' })
		expect(input.harness).toBe('claude')
		expect(input.command).toContain("'sonnet'")
		expect(input.command).toContain('Look for correctness bugs first.')
	})

	it('an explicit --harness overrides the resolved def own harness', () => {
		const file = defFile('name: reviewer\nharness: claude\nmodel: sonnet', 'Look for correctness bugs first.')
		expect(spawnCommandInput({ agentFile: file, harness: 'codex', task: 't' }).input.harness).toBe('codex')
	})

	it('carries every spawn flag through to the domain input', () => {
		const { input } = spawnCommandInput({
			harness: 'claude',
			task: 'do the thing',
			briefFile: '/tmp/b.md',
			handle: 'bob',
			branch: 'topic',
			worktreePath: '/tmp/wt',
			at: 'tab',
		})
		expect(input).toMatchObject({
			harness: 'claude',
			task: 'do the thing',
			briefFile: '/tmp/b.md',
			handle: 'bob',
			branch: 'topic',
			worktreePath: '/tmp/wt',
			at: 'tab',
		})
	})

	it('--no-wake suppresses the first-turn doorbell, and its absence rings', () => {
		// Commander sets `wake: false` for --no-wake. Both polarities, so an inverted wire fails too.
		expect(spawnCommandInput({ harness: 'claude', task: 't', wake: false }).noWake).toBe(true)
		expect(spawnCommandInput({ harness: 'claude', task: 't', wake: true }).noWake).toBe(false)
		expect(spawnCommandInput({ harness: 'claude', task: 't' }).noWake).toBe(false)
	})

	it('errors when no harness can be resolved', () => {
		expect(() => spawnCommandInput({ task: 't' })).toThrow(/--harness/)
	})
})

describe('spec:cyberlegion/unit/lifecycle read command output', () => {
	it('prints the captured trailing output', () => {
		expect(readCommandOutput('toon', { ref: 'peer', pane: '%9', output: 'line one\nline two' })).toBe(
			'line one\nline two',
		)
	})

	it('wraps it in the JSON envelope under --format json', () => {
		const out = readCommandOutput('json', { ref: 'peer', pane: '%9', output: 'line one' })
		expect(JSON.parse(out)).toEqual({ ref: 'peer', pane: '%9', output: 'line one' })
	})
})
