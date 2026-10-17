import { basename } from 'node:path'
import type { Exec } from 'cyber-mux'
import type { AgentRecord } from './store/store.ts'

// The Claude background-session backend (ADR-0036): a unit hosted in a session Claude Code starts and
// keeps on its own (`claude --bg`), with no pane. Every per-unit operation dispatches here when the
// unit's record carries the `claude-bg` locator; this module is the one place that knows the `claude`
// commands and how to read what they print.

/** The locator tag a background-hosted unit's record carries in `pane.mux`. */
export const BACKGROUND = 'claude-bg'

/** The short id of a background-hosted unit's session, or undefined for any other record. */
export function backgroundId(rec: AgentRecord): string | undefined {
	return rec.pane?.mux === BACKGROUND ? rec.pane.id : undefined
}

/** One entry of Claude Code's session listing — only the fields this backend reads. */
interface ListedSession {
	/** The short id `claude --bg` printed. */
	id: string
	/** The full session id, the only form `claude --bg --resume` wakes without starting a copy. */
	sessionId: string
	/** Whether a turn is running: `idle` or `busy`. Absent for an entry with no process. */
	status?: string
	/** Claude Code's judgement of the task (`working`, `done`, `blocked`, `stopped`, …) — independent of
	 * whether a turn is running: an idle session with an unfinished task reads `working`. */
	state: string
}

/**
 * Claude Code's session listing (`claude agents --json --all`), or undefined when it cannot be read: a
 * non-zero exit, or output that is not a JSON array. An empty array is an answer — Claude Code lists
 * nothing when no session runs.
 */
export function listSessions(exec: Exec): ListedSession[] | undefined {
	const out = exec('claude', ['agents', '--json', '--all'])
	if (out === null) return undefined
	let parsed: unknown
	try {
		parsed = JSON.parse(out)
	} catch {
		return undefined
	}
	if (!Array.isArray(parsed)) return undefined
	return parsed
		.filter((e): e is Record<string, unknown> => typeof e === 'object' && e !== null)
		.map((e) => ({
			id: String(e.id ?? ''),
			sessionId: String(e.sessionId ?? ''),
			...(typeof e.status === 'string' ? { status: e.status } : {}),
			state: String(e.state ?? ''),
		}))
}

/** Whether a listing positively shows the session gone: it was read, and the short id is not in it.
 * An unreadable listing proves nothing. */
export function sessionGone(listing: ListedSession[] | undefined, short: string): boolean {
	return listing !== undefined && !listing.some((s) => s.id === short)
}

/**
 * Refuse a launch that is not the `claude` command before anything is created: the background flags
 * are appended to it, and a wrapper may not take them. The first word must be `claude`, bare or a
 * path whose last segment is `claude`.
 */
export function assertClaudeLaunch(launch: string): void {
	const first = launch.trim().split(/\s+/)[0] ?? ''
	if (basename(first) === 'claude') return
	throw new Error(
		`a background session runs the claude command, and the launch "${launch}" is not the claude command ` +
			`(it starts with "${first}") — refusing before creating anything`,
	)
}

/** Refuse `--no-wake` before anything is created: a session started with no prompt reads `blocked`,
 * which a ring cannot tell from a permission prompt, so the unit could never be rung. */
export function refuseNoWake(): Error {
	return new Error(
		'--no-wake is unsupported on a background session — it takes its first turn from the prompt it starts with, ' +
			'and one started with none reads blocked and could never be rung; refusing before creating anything',
	)
}

/**
 * Run `script` — a shell line that changes into `folder` and runs `claude --bg` — and return the short
 * id it printed. Throws when the session did not start: Claude Code does not trust the folder, the
 * command failed, or it exited 0 without a `backgrounded · <short id>` line.
 */
export function startSession(exec: Exec, folder: string, script: string): string {
	const out = exec('sh', ['-c', script])
	if (out === null) {
		const reason = exec.lastError ?? ''
		if (/^Workspace not trusted\./.test(reason)) {
			throw new Error(
				`Claude Code does not trust ${folder}, so the background session did not start — trust that folder ` +
					`(or one above it) in Claude Code, then spawn again: ${reason}`,
			)
		}
		throw new Error(`the background session did not start: ${reason || 'claude --bg exited non-zero'}`)
	}
	const short = out.match(/backgrounded\s*·\s*([0-9a-f]{8})/)?.[1]
	if (!short) throw new Error(`the background session did not start — claude --bg named no session: ${out}`)
	return short
}

/**
 * Ring a background-hosted unit: deliver `text` as its next turn. Only a session with no turn running
 * (`status: idle`) can be rung — it is stopped, then resumed by its full session id with `text` as the
 * prompt, and the ring counts once the resume says it woke the same short id. A session waiting on a
 * person (`state: blocked`, checked first), a busy one, or one reporting neither busy nor idle is not
 * rung and not stopped (stopping it would end its turn). Throws on every path that did not ring.
 */
export function ringSession(exec: Exec, rec: AgentRecord, text: string): void {
	const short = backgroundId(rec) as string
	const unit = `unit "${rec.handle}"`
	if (rec.status === 'stopped') {
		throw new Error(`${unit} is stopped — a stopped unit is not rung; its mail waits in its inbox`)
	}
	const listing = listSessions(exec)
	if (!listing) {
		throw new Error(
			`could not read the state of ${unit}'s background session ${short} — claude agents --json --all gave no listing; nothing was stopped`,
		)
	}
	const session = listing.find((s) => s.id === short)
	if (!session) {
		throw new Error(`${unit}'s background session ${short} is gone — it no longer exists in Claude Code's listing`)
	}
	if (session.state === 'blocked') {
		throw new Error(
			`${unit} is waiting on a person — its background session ${short} is blocked, so it was not rung; ` +
				`open it with claude attach ${short}`,
		)
	}
	if (session.status === 'busy') {
		throw new Error(`${unit} is busy — its background session ${short} is running a turn, so it was not rung`)
	}
	if (session.status !== 'idle') {
		throw new Error(
			`${unit}'s background session ${short} is not idle (status ${session.status ?? 'absent'}, state ` +
				`${session.state}), so it was not rung`,
		)
	}
	if (exec('claude', ['stop', short]) === null) {
		throw new Error(`claude stop ${short} failed, so ${unit} was not rung: ${exec.lastError ?? 'non-zero exit'}`)
	}
	const out = exec('claude', ['--bg', '--resume', session.sessionId, text])
	if (out === null) {
		throw new Error(`${unit} was not woken — claude --bg --resume failed: ${exec.lastError ?? 'non-zero exit'}`)
	}
	const woke =
		!/started a copy/.test(out) &&
		(out.includes(`woke session ${short}`) || new RegExp(`backgrounded\\s*·\\s*${short}`).test(out))
	if (!woke) throw new Error(`${unit} was not woken — claude --bg --resume did not wake session ${short}: ${out}`)
}

const ESC = String.fromCharCode(27)
const BEL = String.fromCharCode(7)
/** OSC (`ESC ] … BEL|ST`), CSI (`ESC [ … final`), and the two-byte escapes. */
const CONTROL_SEQUENCE = new RegExp(
	`${ESC}\\][\\s\\S]*?(?:${BEL}|${ESC}\\\\)|${ESC}\\[[0-?]*[ -/]*[@-~]|${ESC}[()][0-9A-Za-z]|${ESC}[@-Z\\\\-_]`,
	'g',
)
/** C0 controls other than tab and newline, and DEL — what is left of a terminal stream once its
 * sequences are gone (a carriage return, a bell). */
const CONTROL_CHAR = new RegExp(
	`[${String.fromCharCode(0)}-${String.fromCharCode(8)}\\v-${String.fromCharCode(31, 127)}]`,
	'g',
)

/** Remove terminal control sequences from a raw terminal stream. */
export function stripControl(text: string): string {
	return text.replace(CONTROL_SEQUENCE, '').replace(CONTROL_CHAR, '')
}

/** A background-hosted unit's recent output: `claude logs`, stripped of control sequences, then
 * bounded to the last `lines` lines. Throws naming the session when the log cannot be read. */
export function readLog(exec: Exec, rec: AgentRecord, lines?: number): string {
	const short = backgroundId(rec) as string
	const out = exec('claude', ['logs', short])
	if (out === null) {
		throw new Error(
			`could not read the log of unit "${rec.handle}"'s background session ${short}: ${exec.lastError ?? 'claude logs exited non-zero'}`,
		)
	}
	const clean = stripControl(out)
	return lines && lines > 0 ? clean.split('\n').slice(-lines).join('\n') : clean
}

/**
 * Stop a background-hosted unit's session and confirm it from the listing: a stopped session is gone
 * from it or listed with no `status` (no process), whatever its `state` — one that finished its turn
 * keeps `done`. `verified` is false when the listing cannot be read afterwards. Throws when the entry
 * still carries a `status`. `claude rm` is not run, so the conversation is kept.
 */
export function stopSession(exec: Exec, rec: AgentRecord): { verified: boolean } {
	const short = backgroundId(rec) as string
	// A failed stop (the session is already gone) is decided by the listing below.
	exec('claude', ['stop', short])
	const listing = listSessions(exec)
	if (!listing) return { verified: false }
	const session = listing.find((s) => s.id === short)
	if (session?.status !== undefined) {
		throw new Error(
			`stop did not take effect — Claude Code still lists unit "${rec.handle}"'s background session ${short} as ` +
				`${session.status}; its record is unchanged`,
		)
	}
	return { verified: true }
}

/** Stop and delete a background-hosted unit's session at close. Failures are tolerated: the session
 * may already be stopped or gone. */
export function removeSession(exec: Exec, short: string): void {
	exec('claude', ['stop', short])
	exec('claude', ['rm', short])
}

/** The refusal for an operation the background backend does not support (focus, clear, restart,
 * rebind). Built before anything is run. */
export function unsupported(rec: AgentRecord, verb: string, why = ''): Error {
	const short = backgroundId(rec) as string
	return new Error(
		`unit "${rec.handle}" runs in a Claude background session (${BACKGROUND} ${short}) — unit ${verb} is unsupported ` +
			`on the background session backend${why}`,
	)
}
