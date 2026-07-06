import { ack, type InboxItem, inbox, type MsgContext } from '../message.ts'

/** Internal poll interval — not user-facing (the round-trip cost of one `mail await` cycle). */
const POLL_MS = 1000

export interface AwaitInput {
	meId: string
	thread: string
	from?: string
	/** Give up after this many ms with no match; 0 = wait forever. Default 600_000 (600s). */
	timeoutMs?: number
	/** Self-cap for one internal poll cycle, in seconds. Default 240 (well under a harness tool-timeout). */
	maxWaitS?: number
	now?: () => number
	sleep?: (ms: number) => Promise<void>
}

export type AwaitOutcome =
	| { kind: 'matched'; message: InboxItem }
	| { kind: 'waiting' } // clean sentinel: no match within this cycle's max-wait cap — re-arm
	| { kind: 'timed-out' } // the caller's overall --timeout elapsed with no match

const DEFAULT_TIMEOUT_MS = 600_000
const DEFAULT_MAX_WAIT_S = 240

/**
 * Block on the caller's UNREAD inbox until a message matching `thread` (and optional `from`)
 * arrives, polling on a fixed ~1s internal interval. Three unambiguous outcomes:
 *
 * - `matched` — a message arrived; it is printed by the caller AND acked here (moved to read/), so
 *   it leaves the unread set. Block-then-read: each await consumes exactly its round.
 * - `waiting` — this call's internal poll cycle hit its `maxWaitS` cap (default 240s, always well
 *   under a harness tool-timeout SIGKILL) with no match yet. A clean, non-error return the caller
 *   re-arms on (calls `awaitReply` again) — NOT the same as giving up.
 * - `timed-out` — the caller's overall `timeoutMs` (default 600_000ms / 600s; `0` = wait forever)
 *   elapsed across re-arms with no match. The caller should exit non-zero.
 */
export async function awaitReply(ctx: MsgContext, input: AwaitInput): Promise<AwaitOutcome> {
	const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS
	const maxWaitMs = (input.maxWaitS ?? DEFAULT_MAX_WAIT_S) * 1000
	const now = input.now ?? (() => Date.now())
	const sleep = input.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))

	const start = now()
	const cycleDeadline = start + maxWaitMs

	for (;;) {
		const items = inbox(ctx, { meId: input.meId, unread: true, thread: input.thread, from: input.from })
		if (items.length > 0) {
			const message = items[0] as InboxItem
			ack(ctx, input.meId, message.id)
			return { kind: 'matched', message }
		}

		const elapsed = now() - start
		if (timeoutMs !== 0 && elapsed >= timeoutMs) return { kind: 'timed-out' }
		if (now() >= cycleDeadline) return { kind: 'waiting' }

		await sleep(POLL_MS)
	}
}
