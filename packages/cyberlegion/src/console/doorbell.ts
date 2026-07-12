import { type Exec, loadAgent } from '../identity.ts'
import type { Store } from '../store/store.ts'
import { type NudgeOptions, nudge } from './nudge.ts'
import type { SessionAdapter } from './session.ts'

/** The doorbell text delivered to a woken recipient; also the standalone `unit nudge` default. */
export const DELIVERY_DOORBELL = 'You have unread mail — check your inbox.'

export interface WakeInput {
	/** The delivered message's recipient id (its `to`). */
	toId: string
	/** The sender's own id — the sender's own pane is never rung. */
	fromId: string
	/** Suppress the doorbell entirely (`mail send --no-nudge`). */
	noNudge?: boolean
}

export interface WakeResult {
	/** Whether a doorbell was delivered as a taken turn. */
	rung: boolean
	/** The pane that was (or would have been) rung, when one was resolved. */
	pane?: string
	/** Set when a live pane was found but the ring never completed — a best-effort failure, not a send error. */
	warning?: string
}

/** Resolve an agent's live session pane: its recorded pane, else a pane pointer keyed by its id. */
function paneOf(store: Store, id: string): string | undefined {
	const rec = loadAgent(store, id)
	return rec?.pane?.id ?? store.findPaneByAgentId(id)
}

/**
 * Best-effort wake the recipient of a just-delivered message so it checks its inbox. A peer's live
 * session pane, or — for a standing owner (which has no session pane of its own) — the hub's bound
 * main pane, is rung via the nudge submit-verify path (a taken turn, not fire-and-forget). Durable
 * delivery already happened; the ring is opportunistic on top, so a legitimate no-op (`--no-nudge`, a
 * headless/absent recipient with no live pane, a standing-owner send with no main pane bound, or a
 * self-addressed send) rings nothing, and a ring that never completes within nudge's retry cap is
 * swallowed into a warning. This never throws — it can never fail the send.
 *
 * The adapter is resolved lazily via `getAdapter`, invoked only once a pane to ring is confirmed and
 * inside the same swallowing try — so a session with no mux backend (where `selectSessionAdapter`
 * throws) is just a no-op wake, never a failed send.
 */
export async function wakeRecipient(
	store: Store,
	getAdapter: () => SessionAdapter,
	exec: Exec,
	input: WakeInput,
	nudgeOpts?: NudgeOptions,
): Promise<WakeResult> {
	if (input.noNudge) return { rung: false }
	const recipient = loadAgent(store, input.toId)
	if (!recipient) return { rung: false }
	// A standing owner has no session pane of its own → ring the human's bound main pane.
	const pane = recipient.kind === 'standing' ? store.getMainPane() : paneOf(store, recipient.id)
	if (!pane) return { rung: false }
	// Never ring the sender's own pane (a self-addressed send resolves the recipient onto the sender).
	if (pane === paneOf(store, input.fromId)) return { rung: false }
	try {
		await nudge(getAdapter(), exec, { id: pane }, DELIVERY_DOORBELL, nudgeOpts)
		return { rung: true, pane }
	} catch (err) {
		return { rung: false, pane, warning: err instanceof Error ? err.message : String(err) }
	}
}
