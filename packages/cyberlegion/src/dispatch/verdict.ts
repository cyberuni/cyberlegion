// Minimal JSON-shape validation for a dispatch result — deliberately NOT a full JSON-Schema
// implementation (no dependency): a schema file names required top-level keys and, optionally, a
// primitive `type` per key. A body that fails validation is an error (fail-loud), never a
// silently-accepted pass.

import { readFileSync } from 'node:fs'

export type VerdictPrimitive = 'string' | 'number' | 'boolean' | 'object' | 'array'

export interface VerdictSchema {
	/** Top-level keys the result object must carry. */
	required?: string[]
	/** Primitive type check per top-level key (only checked when the key is present). */
	properties?: Record<string, VerdictPrimitive>
}

export type VerdictOutcome = { ok: true; value: unknown } | { ok: false; error: string }

function primitiveTypeOf(v: unknown): VerdictPrimitive {
	if (Array.isArray(v)) return 'array'
	return typeof v as VerdictPrimitive
}

/**
 * Parse `body` as JSON and, when `schemaFile` is given, structurally check it against a minimal
 * required/type schema. Any failure — invalid JSON, an unreadable/invalid schema file, a missing
 * required key, or a type mismatch — is `{ ok: false }`, never a pass.
 */
export function validateVerdict(body: string, schemaFile?: string): VerdictOutcome {
	let value: unknown
	try {
		value = JSON.parse(body)
	} catch (err) {
		return { ok: false, error: `verdict body is not valid JSON: ${err instanceof Error ? err.message : String(err)}` }
	}
	if (!schemaFile) return { ok: true, value }

	let schema: VerdictSchema
	try {
		schema = JSON.parse(readFileSync(schemaFile, 'utf8')) as VerdictSchema
	} catch (err) {
		return {
			ok: false,
			error: `verdict schema "${schemaFile}" is not readable/valid JSON: ${err instanceof Error ? err.message : String(err)}`,
		}
	}

	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		return { ok: false, error: 'verdict body must be a JSON object to validate against a schema' }
	}
	const obj = value as Record<string, unknown>

	for (const key of schema.required ?? []) {
		if (!(key in obj)) return { ok: false, error: `verdict is missing required key "${key}"` }
	}
	for (const [key, expected] of Object.entries(schema.properties ?? {})) {
		if (!(key in obj)) continue
		const actual = primitiveTypeOf(obj[key])
		if (actual !== expected) {
			return { ok: false, error: `verdict key "${key}" expected type "${expected}" but got "${actual}"` }
		}
	}
	return { ok: true, value }
}
