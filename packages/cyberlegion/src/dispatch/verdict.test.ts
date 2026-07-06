import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { validateVerdict } from './verdict.ts'

function schemaFile(schema: unknown): string {
	const dir = mkdtempSync(join(tmpdir(), 'cl-schema-'))
	const path = join(dir, 'schema.json')
	writeFileSync(path, JSON.stringify(schema))
	return path
}

describe('validateVerdict — no schema', () => {
	it('parses valid JSON and returns the value', () => {
		const out = validateVerdict('{"status":"ok"}')
		expect(out).toEqual({ ok: true, value: { status: 'ok' } })
	})

	it('fails on invalid JSON', () => {
		const out = validateVerdict('not json')
		expect(out.ok).toBe(false)
		expect(!out.ok && out.error).toMatch(/not valid JSON/)
	})
})

describe('validateVerdict — with a schema', () => {
	it('passes when every required key is present with the right primitive type', () => {
		const schema = schemaFile({ required: ['status', 'count'], properties: { status: 'string', count: 'number' } })
		const out = validateVerdict('{"status":"ok","count":3}', schema)
		expect(out).toEqual({ ok: true, value: { status: 'ok', count: 3 } })
	})

	it('fails when a required key is missing', () => {
		const schema = schemaFile({ required: ['status', 'reviewer'] })
		const out = validateVerdict('{"status":"ok"}', schema)
		expect(out.ok).toBe(false)
		expect(!out.ok && out.error).toMatch(/missing required key "reviewer"/)
	})

	it('fails on a primitive type mismatch', () => {
		const schema = schemaFile({ properties: { count: 'number' } })
		const out = validateVerdict('{"count":"three"}', schema)
		expect(out.ok).toBe(false)
		expect(!out.ok && out.error).toMatch(/expected type "number" but got "string"/)
	})

	it('fails when the body is not a JSON object at all', () => {
		const schema = schemaFile({ required: ['status'] })
		const out = validateVerdict('[1,2,3]', schema)
		expect(out.ok).toBe(false)
		expect(!out.ok && out.error).toMatch(/must be a JSON object/)
	})

	it('fails loud (not a silent pass) when the schema file itself is unreadable', () => {
		const out = validateVerdict('{"status":"ok"}', join(tmpdir(), 'does-not-exist-schema.json'))
		expect(out.ok).toBe(false)
		expect(!out.ok && out.error).toMatch(/schema .* not readable/)
	})
})
