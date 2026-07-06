import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { FileStore } from '../store/file-store.ts'
import { type DispatchContext, prep } from './prep.ts'

let store: FileStore
let ctx: DispatchContext

beforeEach(() => {
	store = new FileStore(join(mkdtempSync(join(tmpdir(), 'cl-')), 'hub'))
	ctx = { store }
})

const AGENT_DEF = `---
name: reviewer
model: sonnet
effort: high
harness: claude
---

Look for correctness bugs first.
`

function writeAgentDef(): string {
	const dir = mkdtempSync(join(tmpdir(), 'cl-agentdef-'))
	const path = join(dir, 'reviewer.md')
	writeFileSync(path, AGENT_DEF)
	return path
}

describe('prep — the envelope', () => {
	it('mints an id, defaults thread to it, writes the brief, and computes the result slot', () => {
		const envelope = prep(ctx, { briefText: 'do the thing' })
		expect(envelope.id).toMatch(/^[0-9a-f]+$/)
		expect(envelope.thread).toBe(envelope.id)
		expect(store.readBrief(envelope.id)).toBe('do the thing')
		expect(envelope.resultFile).toBe(store.resultPath(envelope.id))
		// no result written yet — prep only allocates the slot
		expect(store.readResult(envelope.id)).toBeUndefined()
	})

	it('honors an explicit --thread instead of defaulting to the id', () => {
		const envelope = prep(ctx, { briefText: 'x', thread: 'cr-42' })
		expect(envelope.thread).toBe('cr-42')
		expect(envelope.id).not.toBe('cr-42')
	})

	it('reads the brief from a file when --brief-file is given', () => {
		const dir = mkdtempSync(join(tmpdir(), 'cl-brief-'))
		const file = join(dir, 'brief.md')
		writeFileSync(file, 'from a file')
		const envelope = prep(ctx, { briefFile: file })
		expect(store.readBrief(envelope.id)).toBe('from a file')
	})

	it('spawns nothing — no agent record and no pane index are created', () => {
		prep(ctx, { briefText: 'x' })
		expect(store.listAgents()).toEqual([])
	})
})

describe('prep — instruction from an agent def', () => {
	it('builds the subagent instruction from a resolved def (brief + result paths, model/effort/instructions)', () => {
		const file = writeAgentDef()
		const envelope = prep(ctx, { agentFile: file, briefText: 'go' })
		expect(envelope.instruction).toContain('subagent_type: reviewer')
		expect(envelope.instruction).toContain('Model: sonnet.')
		expect(envelope.instruction).toContain('Effort: high.')
		expect(envelope.instruction).toContain(envelope.briefFile)
		expect(envelope.instruction).toContain(envelope.resultFile)
		expect(envelope.instruction).toContain('Look for correctness bugs first.')
	})

	it('falls back to a generic instruction (naming brief + result paths) when no agent def is given', () => {
		const envelope = prep(ctx, { briefText: 'go', role: 'triager' })
		expect(envelope.instruction).toContain('role: triager')
		expect(envelope.instruction).toContain(envelope.briefFile)
		expect(envelope.instruction).toContain(envelope.resultFile)
	})

	it('an unresolvable --agent name throws a clear error rather than silently falling back', () => {
		expect(() => prep(ctx, { agent: 'ghost', briefText: 'go' })).toThrow(/no agent definition named "ghost"/)
	})
})

describe('prep — brief source errors', () => {
	it('throws a clear error when neither --brief-text nor --brief-file is given', () => {
		expect(() => prep(ctx, {})).toThrow(/--body|--brief/)
	})
})
