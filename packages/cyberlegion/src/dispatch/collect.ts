// The SUBAGENT path's result read: the parent invoked its own Task tool (the Task's blocking IS
// the wait — no mail/await involved), the subagent wrote its result JSON to `prep()`'s resultFile,
// and the parent reads it back here. The channel path's counterpart is `mail await` (`channel.ts`).

import type { Store } from '../store/store.ts'
import type { DispatchResult } from './channel.ts'
import { validateVerdict } from './verdict.ts'

export interface CollectContext {
	store: Store
	now?: () => number
}

/** Read + validate a dispatch's result file. Throws (fail-loud) when the file is not yet written,
 * or when it fails the optional verdict schema. */
export function collect(ctx: CollectContext, id: string, verdictSchema?: string): DispatchResult {
	const body = ctx.store.readResult(id)
	if (body === undefined) {
		throw new Error(`no result written yet for dispatch "${id}" — the subagent has not written its result file`)
	}
	const validated = validateVerdict(body, verdictSchema)
	if (!validated.ok) throw new Error(validated.error)
	return { id, verdict: validated.value, body, ts: ctx.now?.() ?? Date.now() }
}
