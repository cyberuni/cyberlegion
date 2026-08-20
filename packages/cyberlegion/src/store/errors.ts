// Typed store errors — named, file-scoped failures instead of a bare `SyntaxError` bubbling up
// from `JSON.parse` deep inside `listInbox`/`listAgents`/`getAgent`. See evidence.md item 5: "no
// silent success on a broken store" (agmsg's phrase) applies just as much to a LOUD but UNNAMED
// failure — a caller catching `SyntaxError` has no way to tell a torn write apart from a caller bug
// that handed `JSON.stringify` something circular, and no file path to report to the human.

/** A record file exists but its content didn't parse as JSON — a torn write (crash mid-`writeFileSync`,
 * pre-atomic-write code path) or on-disk tampering. Carries the file path and the original parse
 * error so a caller can report exactly what's broken and where, rather than "Unexpected token" with
 * no location. */
export class CorruptRecordError extends Error {
	constructor(
		public readonly file: string,
		cause: unknown,
	) {
		super(`corrupt record at "${file}": ${cause instanceof Error ? cause.message : String(cause)}`, { cause })
		this.name = 'CorruptRecordError'
	}
}
