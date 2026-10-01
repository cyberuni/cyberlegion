// The one live probe of cursor's model listing. Kept out of `agentdef/realize.ts` so the launch
// builder stays pure: `unit spawn` hands this in as the lister, and tests mock this module.

import { execFileSync } from 'node:child_process'
import { stripVTControlCharacters } from 'node:util'

/** The model ids in `cursor-agent models` output: the first token of each line, ANSI colour and list
 * bullets stripped. Headings and tips come along too; callers only test a specific id for membership. */
export function parseCursorModels(output: string): string[] {
	return stripVTControlCharacters(output)
		.split('\n')
		.map(
			(line) =>
				line
					.trim()
					.replace(/^[-*•]\s+/, '')
					.split(/\s+/)[0] ?? '',
		)
		.filter((id) => id !== '')
}

/** The model ids this account's `cursor-agent` lists, or none when the probe fails (not installed,
 * signed out, timed out) — the caller then launches without the effort and warns. */
export function listCursorModels(): string[] {
	try {
		const out = execFileSync('cursor-agent', ['models'], {
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore'],
			timeout: 15_000,
		})
		return parseCursorModels(out)
	} catch {
		return []
	}
}
