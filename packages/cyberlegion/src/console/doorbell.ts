import type { MuxAdapter, MuxTarget, NudgeOptions } from 'cyber-mux'
import { type Exec, loadAgent, presenceOf } from '../identity.ts'
import type { Store } from '../store/store.ts'
import { type DraftGuardOptions, withDraftGuard } from './prompt-guard.ts'
import { ringTurn } from './ring.ts'

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

const SPAWN_DOORBELL = /^Readyourbriefat.+,thenbeginwork\.$/
const RESUME_DOORBELL =
	/^Yoursessionwasrestartedwithitsconversationresumed—continueyourwork\.Ifyouhavenoearlierconversation,readyourbriefat.+,thenbeginwork\.$/

/**
 * Whether `text`, read out of a peer's input box, is a ring cyberlegion typed — the delivery doorbell,
 * a spawn or resume doorbell, or `message`, the one about to be rung — rather than a human's draft. A harness
 * can take a ring and put its text back in the box (cursor-agent with a rejected login). Whitespace is
 * ignored, since the box wraps the text onto rows wherever it likes.
 */
export function isRingText(text: string, message?: string): boolean {
	const squeeze = (s: string) => s.replace(/\s+/g, '')
	const box = squeeze(text)
	if (box === '') return false
	return (
		box === squeeze(DELIVERY_DOORBELL) ||
		SPAWN_DOORBELL.test(box) ||
		RESUME_DOORBELL.test(box) ||
		(message !== undefined && box === squeeze(message))
	)
}

/**
 * The first-turn instruction for a restarted session that resumed its conversation. The resume can
 * fall back to a fresh session (the harness no longer has the conversation), and the ring cannot tell
 * which one took the turn, so it names the brief for a session that finds no earlier conversation.
 */
export function resumeDoorbell(briefPath: string): string {
	return `Your session was restarted with its conversation resumed — continue your work. If you have no earlier conversation, read your brief at ${briefPath}, then begin work.`
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
	guardOpts?: DraftGuardOptions,
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
	// Whose input box the ring lands in, so the draft guard reads the right shape. The bound main pane
	// is a human's session with no record to name its harness; the guard tries every known shape there.
	let harness: string | undefined
	let focusGated = false
	if (recipient.kind === 'standing') {
		// Off the record already in hand, never re-resolved by handle: `resolvePresence` throws when the
		// standing record races away (a concurrent close/decommission), and this wake must never fail a
		// send that already landed durably.
		const presenceUnit = presenceOf(store, recipient)
		if (presenceUnit) {
			pane = paneOf(store, presenceUnit.id)
			harness = presenceUnit.harness
		} else {
			pane = store.getMainPane()
			focusGated = true
		}
	} else {
		pane = paneOf(store, recipient.id)
		harness = recipient.harness
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
		const adapter = getAdapter()
		const target = { id: pane }
		await withDraftGuard(adapter, exec, target, () => ringTurn(adapter, exec, target, DELIVERY_DOORBELL, nudgeOpts), {
			...guardOpts,
			harness,
			ownText: (text) => isRingText(text),
		})
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
	/** The session resumed its conversation (`unit restart`), so it is told to continue, not to start. */
	resumed?: boolean
	/** The peer's harness, so the draft guard reads its input box with the right shape. */
	harness?: string
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
 * The ring counts only once the harness posts the doorbell (`requirePosted`), not merely once it
 * leaves the input box: a doorbell typed before a booting harness drew its box vanishes the same way,
 * and nothing else will tell the peer its brief exists. A fresh session has no earlier copy to
 * scroll away, so the posted copy is a reliable sign here.
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
	guardOpts?: DraftGuardOptions,
): Promise<WakeResult> {
	if (input.noWake) return { rung: false }
	try {
		const adapter = getAdapter()
		const doorbell = (input.resumed ? resumeDoorbell : spawnDoorbell)(input.briefPath)
		await withDraftGuard(
			adapter,
			exec,
			input.target,
			() => ringTurn(adapter, exec, input.target, doorbell, { ...nudgeOpts, requirePosted: true }),
			{ ...guardOpts, harness: input.harness, ownText: (text) => isRingText(text) },
		)
		return { rung: true, pane: input.target.id }
	} catch (err) {
		return { rung: false, pane: input.target.id, warning: err instanceof Error ? err.message : String(err) }
	}
}
