import { type MuxAdapter, type MuxTarget, type NudgeOptions, nudge } from 'cyber-mux'
import { type Exec, loadAgent, presenceOf } from '../identity.ts'
import type { Store } from '../store/store.ts'

/** The doorbell text delivered to a woken recipient; also the standalone `unit nudge` default. */
export const DELIVERY_DOORBELL = 'You have unread mail — check your inbox.'

/**
 * The first-turn doorbell `unit spawn` delivers to a freshly-opened paned peer — the instruction
 * itself, not a notification that context is already populated. It names the brief's **file path**
 * and tells the peer to read it and begin, so pickup does not depend on a SessionStart hook firing
 * in the child (superseding ADR-0027, which split payload-delivery from turn-delivery).
 *
 * The path is named, never the brief's body: the brief is still written to its file and still never
 * typed into the pane, so a long brief costs one line here however large it is, and a re-submit on
 * the boot race re-types this instruction rather than the payload.
 */
export function spawnDoorbell(briefPath: string): string {
	return `Read your brief at ${briefPath}, then begin work.`
}

/**
 * A freshly-launched harness cold-boots slower than an already-running peer, so the spawn first-turn
 * ring gets a wider retry budget than a plain `mail send` doorbell (nudge's own 10 × 400ms): flush the
 * staged buffer for up to ~8s (20 × 400ms) before giving up. The common case still returns after one
 * settle cycle once the peer takes the turn — the budget only bounds a slow or stuck boot. Still
 * bounded — a harness that never reaches its prompt resolves to a best-effort warning, never a hang.
 */
const SPAWN_NUDGE_OPTS: NudgeOptions = { attempts: 20, settleMs: 400 }

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
 * session pane, a standing owner's bound presence (`unit claim` — the live unit standing in for it,
 * an exited one falling back below), or — with neither — the hub's bound main pane, is rung via the
 * nudge submit-verify path (a taken turn, not fire-and-forget). Durable delivery already happened;
 * the ring is opportunistic on top, so a legitimate no-op (`--no-nudge`, a headless/absent recipient
 * with no live pane, a standing-owner send with no presence and no main pane bound, or a
 * self-addressed send) rings nothing, and a ring that never completes within nudge's retry cap is
 * swallowed into a warning. This never throws — it can never fail the send.
 *
 * The adapter is resolved lazily via `getAdapter`, invoked only once a pane to ring is confirmed and
 * inside the same swallowing try — so a session with no mux backend (where `selectSessionAdapter`
 * throws) is just a no-op wake, never a failed send.
 */
export async function wakeRecipient(
	store: Store,
	getAdapter: () => MuxAdapter,
	exec: Exec,
	input: WakeInput,
	nudgeOpts?: NudgeOptions,
): Promise<WakeResult> {
	if (input.noNudge) return { rung: false }
	const recipient = loadAgent(store, input.toId)
	if (!recipient) return { rung: false }
	// A standing owner has no session pane of its own. With a LIVE bound presence (`unit claim`) it
	// rings that unit's pane — the existing peer rule reaching its proper subject: a presence is an
	// agent expected to take the turn, not a human whose attention is the scarce resource, so it is
	// never focus-gated. With no presence bound (or an exited one — never ring a corpse), it falls
	// back to the human's bound main pane, focus-gated exactly as before.
	let pane: string | undefined
	let focusGated = false
	if (recipient.kind === 'standing') {
		// Off the record already in hand, never re-resolved by handle: `resolvePresence` throws when the
		// standing record races away (a concurrent close/decommission), and this wake must never fail a
		// send that already landed durably.
		const presenceUnit = presenceOf(store, recipient)
		if (presenceUnit) {
			pane = paneOf(store, presenceUnit.id)
		} else {
			pane = store.getMainPane()
			focusGated = true
		}
	} else {
		pane = paneOf(store, recipient.id)
	}
	if (!pane) return { rung: false }
	// Never ring the sender's own pane (a self-addressed send resolves the recipient onto the sender).
	if (pane === paneOf(store, input.fromId)) return { rung: false }
	// The focus gate applies only to a standing owner's bound-main-pane fallback (human-presence
	// signal) — a peer's live pane, and a standing owner's bound presence, are always rung regardless
	// of focus. Skip the ring only when POSITIVELY not focused; `true` or `undefined` (probe error, no
	// backend, unresolvable pane) fail open and still ring, so the doorbell never silently drops on an
	// ambiguous probe.
	if (focusGated) {
		let focused: boolean | undefined
		try {
			focused = getAdapter().isPaneFocused(exec, { id: pane })
		} catch {
			focused = undefined
		}
		if (focused === false) return { rung: false, pane }
	}
	try {
		await nudge(getAdapter(), exec, { id: pane }, DELIVERY_DOORBELL, nudgeOpts)
		return { rung: true, pane }
	} catch (err) {
		return { rung: false, pane, warning: err instanceof Error ? err.message : String(err) }
	}
}

export interface WakeSpawnInput {
	/** The freshly-opened peer's session pane. */
	target: MuxTarget
	/** Where the peer's brief was written — named in the doorbell so the peer can go read it. The
	 * path, never the brief's body. */
	briefPath: string
	/** Suppress the first-turn doorbell entirely (`unit spawn --no-wake`). */
	noWake?: boolean
}

/**
 * Best-effort deliver a freshly-spawned paned peer's first turn so it acts on its brief with no
 * human nudge. A paned agent boots to an idle prompt — the brief sits unread on disk and the model
 * takes no turn on its own, unlike a subagent (where the caller's Task call IS the turn). So `unit
 * spawn` rings the instruction (`spawnDoorbell`, naming the brief's file path) over the
 * boot-race-aware `nudge` submit-verify path (a taken turn, never typing the brief itself), the same
 * best-effort ring `wakeRecipient` gives `mail send`: the spawn (worktree, session, registry record)
 * is the guaranteed effect and the ring is opportunistic on top, so `--no-wake` rings nothing and a
 * ring that never completes within the retry budget is swallowed into a warning. This never throws —
 * it can never fail the spawn.
 *
 * The adapter is resolved lazily via `getAdapter` inside the same swallowing try, so even a session
 * whose backend has since gone away (where `selectSessionAdapter` would throw) degrades to a warned
 * no-op rather than a failed spawn.
 */
export async function wakeSpawn(
	getAdapter: () => MuxAdapter,
	exec: Exec,
	input: WakeSpawnInput,
	nudgeOpts: NudgeOptions = SPAWN_NUDGE_OPTS,
): Promise<WakeResult> {
	if (input.noWake) return { rung: false }
	try {
		await nudge(getAdapter(), exec, input.target, spawnDoorbell(input.briefPath), nudgeOpts)
		return { rung: true, pane: input.target.id }
	} catch (err) {
		return { rung: false, pane: input.target.id, warning: err instanceof Error ? err.message : String(err) }
	}
}
