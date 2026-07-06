// AXI-shaped CLI output: TOON default (compact, aggregate-first), `--format json` escape.
// stdout carries the machine result only; stderr carries next-step / warning / error lines —
// callers must route accordingly (see `nextStep` / `fail`).

export type Format = 'toon' | 'json'

function stringifyCell(v: unknown): string {
	if (v == null) return ''
	const s = String(v)
	return /[,\n"]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** One TOON-encoded object: `key: value` lines, blank/undefined fields dropped. */
export function toonObject(fields: Record<string, unknown>): string {
	return Object.entries(fields)
		.filter(([, v]) => v != null)
		.map(([k, v]) => `${k}: ${v}`)
		.join('\n')
}

/** One TOON-encoded list: a `name[N]{field,...}:` header plus one row per item, then an aggregate
 * summary line. Definitive on empty — still emits `name[0]{...}:` plus the summary line. */
export function toonList<T>(
	name: string,
	items: T[],
	fields: { key: string; get: (item: T) => unknown }[],
	summary: string,
): string {
	const header = `${name}[${items.length}]{${fields.map((f) => f.key).join(',')}}:`
	const rows = items.map((item) => fields.map((f) => stringifyCell(f.get(item))).join(','))
	return [header, ...rows.map((r) => `  ${r}`), summary].join('\n')
}

export interface EmitPayload<T = unknown> {
	/** The TOON-rendered string (already includes any aggregate/summary line). */
	toon: string
	/** The structured value emitted verbatim as JSON under `--format json`. */
	json: T
}

/** Print a command's result to stdout in the requested format. */
export function emit(format: Format, payload: EmitPayload): void {
	if (format === 'json') {
		console.log(JSON.stringify(payload.json, null, 2))
	} else {
		console.log(payload.toon)
	}
}

/** A stderr-only next-step suggestion — never part of the machine-readable stdout result. */
export function nextStep(msg: string): void {
	console.error(`→ ${msg}`)
}

/** A structured, fail-loud error: stderr + exit 1. Never prompts, never partially writes. */
export function fail(msg: string): never {
	console.error(JSON.stringify({ error: msg }))
	process.exit(1)
}
