import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { FileStore } from '../store/file-store.ts'
import { collect } from './collect.ts'

let store: FileStore

beforeEach(() => {
	store = new FileStore(join(mkdtempSync(join(tmpdir(), 'cl-')), 'hub'))
})

function schemaFile(schema: unknown): string {
	const dir = mkdtempSync(join(tmpdir(), 'cl-schema-'))
	const path = join(dir, 'schema.json')
	writeFileSync(path, JSON.stringify(schema))
	return path
}

describe('collect — the SUBAGENT path result read', () => {
	it('reads and validates a written result file', () => {
		store.writeResult('d1', { status: 'ok', notes: 'done' })
		const result = collect({ store, now: () => 42 }, 'd1')
		expect(result.id).toBe('d1')
		expect(result.verdict).toEqual({ status: 'ok', notes: 'done' })
		expect(result.ts).toBe(42)
	})

	it('throws (fail-loud, not a silent pass) when no result has been written yet', () => {
		expect(() => collect({ store }, 'ghost')).toThrow(/no result written yet/)
	})

	it('a result failing the verdict schema is an error, not a pass', () => {
		store.writeResult('d1', { status: 'ok' })
		const schema = schemaFile({ required: ['status', 'reviewer'] })
		expect(() => collect({ store }, 'd1', schema)).toThrow(/missing required key "reviewer"/)
	})
})
