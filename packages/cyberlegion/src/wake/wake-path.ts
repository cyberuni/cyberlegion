import type { MuxProbe } from '../console/mux-probe.ts'

/**
 * The wake-matrix path a gateway would drive a turn through. Pure decision helper — no I/O, no
 * polling, no session backend calls; the gateway (`legion-gateway-legate`, CR-5) composes this with
 * the actual `mail await` / `unit nudge` primitives.
 *
 * - **A** — a single unbounded `mail await` (not returned here; superseded by A-loop everywhere the
 *   gateway drives this decision, since a raw A risks a harness tool-timeout SIGKILL).
 * - **A-loop** — the portable default: a bounded `mail await` cycle, re-armed by the caller.
 * - **A-prime** — Claude Code with an observable background task: run `await` via
 *   `run_in_background` and poll its result instead of blocking the turn.
 * - **B** — a live foreign session behind a verified multiplexer: ring the doorbell
 *   (`unit nudge`) instead of polling. Never selected without a mux.
 * - **C** — own-the-PTY (dropped from the shipped matrix; kept as a type for completeness).
 * - **D** — `/loop`-style external re-invocation (dropped from the shipped matrix).
 * - **E** — hook surfacing at a turn boundary (selected by the caller directly, not by this
 *   function — it has no wait/poll shape to decide between).
 */
type WakePath = 'A' | 'A-loop' | 'A-prime' | 'B' | 'C' | 'D' | 'E'

export interface WakePathInput {
	/** The calling harness, e.g. 'claude' | 'cursor' | 'codex'. */
	harness: string
	mux: MuxProbe
	/** The harness can observe a backgrounded task's result without blocking the turn. */
	observable?: boolean
	/** The target is a live, foreign interactive session that can be rung rather than polled. */
	dedicatedListener?: boolean
}

export interface WakePathResult {
	path: WakePath
	why: string
}

/**
 * Select a wake path from the shipped matrix. Rule order: a `mux.mux === 'none'` caller can never
 * get **B** — it always falls through to the bounded poll. Claude Code + an observable background
 * task prefers **A-prime**. A live foreign session behind a verified mux prefers **B**. Otherwise
 * the portable default is **A-loop**.
 */
export function selectWakePath(input: WakePathInput): WakePathResult {
	if (input.mux.mux === 'none') {
		return { path: 'A-loop', why: 'no multiplexer detected — bounded poll only, B is never available' }
	}
	if (input.harness === 'claude' && input.observable) {
		return { path: 'A-prime', why: 'Claude Code + an observable background task — await via run_in_background' }
	}
	if (input.dedicatedListener) {
		return { path: 'B', why: `a live foreign session behind a verified ${input.mux.mux} mux — ring the doorbell` }
	}
	return { path: 'A-loop', why: 'portable default — bounded mail await cycle' }
}
