import { isStaged, type MuxAdapter, type MuxTarget, type NudgeOptions, type NudgeResult } from 'cyber-mux'
import type { Exec } from '../identity.ts'

const DEFAULT_ATTEMPTS = 10
const DEFAULT_SETTLE_MS = 400
/** cyber-mux's `isStaged` matches on the same prefix length. */
const NEEDLE_LEN = 40

/** How many screen rows carry `message` — the transcript, a queued follow-up, the input box. */
function copiesOn(screen: string | null | undefined, message: string): number {
	if (!screen) return 0
	const needle = message.replace(/\s+/g, ' ').trim().slice(0, NEEDLE_LEN)
	if (needle === '') return 0
	return screen.split('\n').filter((row) => row.replace(/\s+/g, ' ').includes(needle)).length
}

/**
 * Submit `message` to `target` as a taken turn: cyber-mux's `nudge`, with one more way to see that the
 * turn was taken.
 *
 * `nudge` judges the turn by whether the text still sits at the bottom of the screen, and flushes
 * with a bare Enter while it does. Some harness screens put a taken turn back in the input box —
 * cursor-agent with a rejected login posts the ring to its transcript (or queues it as a follow-up)
 * and restores the same text into the box — so `nudge` flushes, and each flush rings again.
 *
 * So the screen is counted before the ring and after each submit. A swallowed Enter adds one copy of
 * the text, the one in the input box. Two or more new copies mean the harness also posted it above
 * the box, so the turn was taken and nothing is flushed. Text still at the bottom with only one new
 * copy is the swallowed Enter, and is flushed as before.
 */
export async function ringTurn(
	adapter: Pick<MuxAdapter, 'paneExists' | 'submit' | 'read'>,
	exec: Exec,
	target: MuxTarget,
	message: string,
	opts: NudgeOptions = {},
): Promise<NudgeResult> {
	const attempts = opts.attempts ?? DEFAULT_ATTEMPTS
	const settleMs = opts.settleMs ?? DEFAULT_SETTLE_MS
	const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))
	if (!adapter.paneExists(exec, target)) {
		throw new Error(`nudge failed: pane ${target.id} no longer exists — the peer's session is gone, not busy.`)
	}
	const before = copiesOn(adapter.read(exec, target).text, message)
	const taken = (): boolean => {
		const screen = adapter.read(exec, target).text
		return !isStaged(screen, message) || copiesOn(screen, message) >= before + 2
	}
	adapter.submit(exec, target, message)
	await sleep(settleMs)
	if (taken()) return { taken: true, resubmits: 0 }
	for (let attempt = 1; attempt <= attempts; attempt++) {
		adapter.submit(exec, target)
		await sleep(settleMs)
		if (taken()) return { taken: true, resubmits: attempt }
	}
	throw new Error(
		`nudge failed: peer at pane ${target.id} never took the turn — input still staged after ${attempts} re-submit attempts`,
	)
}
