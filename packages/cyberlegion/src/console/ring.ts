import { isStaged, type MuxAdapter, type MuxTarget, type NudgeOptions, type NudgeResult } from 'cyber-mux'
import type { Exec } from '../identity.ts'
import { knowsPromptOf, readPrompt } from './prompt-guard.ts'

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
 * Read `screen` for the ring: whether `message` sits in the input box, and how many copies of it
 * are on screen outside the box. With the box read by its harness's shape, copies inside the box are
 * left out of the count: a booting harness can take several typed copies as one paste, and those
 * copies are staged text, not posted turns. A screen with no input box the reader knows falls back to
 * cyber-mux's `isStaged`, and the box's copy is counted with the rest.
 */
function readRing(screen: string | null | undefined, message: string, harness: string | undefined) {
	const box = screen ? readPrompt(screen, harness) : { kind: 'unknown' as const }
	if (box.kind === 'unknown') {
		return { boxKnown: false, staged: isStaged(screen, message), outside: copiesOn(screen, message) }
	}
	const inBox = box.kind === 'draft' ? copiesOn(box.text, message) : 0
	return { boxKnown: true, staged: inBox > 0, outside: copiesOn(screen, message) - inBox }
}

export interface RingOptions extends NudgeOptions {
	/** Count the turn taken only once the harness posts the text, not merely once it leaves the box. */
	requirePosted?: boolean
	/** The target's harness, so its input box is read with the right shape. Unknown, every shape is tried. */
	harness?: string | undefined
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
 *
 * With `requirePosted`, text gone from the box is not enough on its own: text typed before the harness
 * drew its input box, or wiped by a redraw, is gone too, and no turn was taken. The turn then counts
 * as taken only when a new copy of the text is on screen — the harness posted it to its transcript or
 * queue. Text that is neither staged nor posted is lost: after one more settle for a slow redraw, it
 * is typed again. It is opt-in because it needs the posted copy to stay on screen: a busy peer's
 * output can scroll earlier copies away, so a ring to it could read as lost and be typed twice.
 *
 * With `requirePosted` and a harness whose input box this reader knows, nothing is typed until the
 * harness has drawn that box, for up to the
 * whole retry budget. Keys typed while a harness boots are buffered, and the harness takes them as one
 * paste once it draws the box: each Enter becomes a newline, so re-typed copies pile up in the box
 * unsent. A box that never shows within the budget is typed into anyway, as before.
 *
 * Where the input box can be read, copies of the text inside it are not counted as posted: only a
 * copy outside the box means the harness took the turn.
 */
export async function ringTurn(
	adapter: Pick<MuxAdapter, 'paneExists' | 'submit' | 'read'>,
	exec: Exec,
	target: MuxTarget,
	message: string,
	opts: RingOptions = {},
): Promise<NudgeResult> {
	const attempts = opts.attempts ?? DEFAULT_ATTEMPTS
	const settleMs = opts.settleMs ?? DEFAULT_SETTLE_MS
	const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))
	if (!adapter.paneExists(exec, target)) {
		throw new Error(`nudge failed: pane ${target.id} no longer exists — the peer's session is gone, not busy.`)
	}
	let first = adapter.read(exec, target).text
	if (opts.requirePosted && knowsPromptOf(opts.harness)) {
		for (let wait = 0; wait < attempts && !readRing(first, message, opts.harness).boxKnown; wait++) {
			await sleep(settleMs)
			first = adapter.read(exec, target).text
		}
	}
	const before = readRing(first, message, opts.harness).outside
	// `staged`: the text sits in the input box, unsent. `lost`: it is neither staged nor posted — typed
	// before the harness drew its input box, or wiped by a redraw — so nothing took the turn.
	const check = (): 'taken' | 'staged' | 'lost' => {
		const seen = readRing(adapter.read(exec, target).text, message, opts.harness)
		// With the box unread, its own copy is in `outside`, so a posted copy makes two.
		const posted = seen.outside >= before + (seen.boxKnown || !seen.staged ? 1 : 2)
		if (seen.staged) return posted ? 'taken' : 'staged'
		return posted || !opts.requirePosted ? 'taken' : 'lost'
	}
	adapter.submit(exec, target, message)
	await sleep(settleMs)
	let state = check()
	if (state === 'taken') return { taken: true, resubmits: 0 }
	let lostReads = state === 'lost' ? 1 : 0
	for (let attempt = 1; attempt <= attempts; attempt++) {
		if (state === 'staged') adapter.submit(exec, target)
		else if (lostReads >= 2) {
			adapter.submit(exec, target, message)
			lostReads = 0
		}
		await sleep(settleMs)
		state = check()
		if (state === 'taken') return { taken: true, resubmits: attempt }
		lostReads = state === 'lost' ? lostReads + 1 : 0
	}
	const why =
		state === 'lost'
			? 'the text vanished without the harness posting it'
			: `input still staged after ${attempts} re-submit attempts`
	throw new Error(`nudge failed: peer at pane ${target.id} never took the turn — ${why}`)
}
