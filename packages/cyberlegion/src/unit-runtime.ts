import { existsSync } from 'node:fs'
import {
	callerPane,
	herdrMuxAdapter,
	type MuxAdapter,
	type MuxPlacement,
	type NudgeOptions,
	tmuxMuxAdapter,
} from 'cyber-mux'
import { wakeSpawn } from './console/doorbell.ts'
import {
	type AgentRecord,
	type Harness,
	type IdContext,
	loadAgent,
	realExec,
	resolveAgent,
	resolveSelfId,
	saveAgent,
	storablePane,
} from './identity.ts'
import { normalizeMuxEnv } from './mux-env.ts'
import { selectSessionAdapter } from './mux-select.ts'
import { composeLaunchLine, LAUNCH_MAP, resetCommandFor, resumeLaunch } from './session.ts'
import { deriveWorkspaceLabel } from './workspace-label.ts'

// A unit's RUNTIME — the harness session in a multiplexer pane — apart from the unit itself (id,
// handle, inbox, brief, worktree). `unit close` (decommission.ts) destroys the unit; this module ends,
// replaces, and inspects its runtime while the unit stays. Nothing here touches a mailbox: a mailbox
// is keyed by the unit's id, so a runtime change needs no mail-side act for pending mail to survive.

export interface RuntimeContext extends IdContext {
	/** The session backend to drive. Defaults to the pane's own multiplexer (when the record names
	 * one) or the backend this environment selects; tests hand in a fake. */
	adapter?: MuxAdapter
}

export interface StopResult {
	agent: AgentRecord
	/** The pane torn down; absent when none could be resolved. */
	pane?: string
	/** True when the backend listed its panes after the teardown and the pane was not among them.
	 * False when the backend gave no list to check against — the stop is recorded but unconfirmed. */
	verified: boolean
	/** The unit was already stopped; nothing was changed. */
	alreadyStopped: boolean
}

/** A standing or service record is an address with no runtime of its own — nothing to stop or start. */
function assertHasRuntime(rec: AgentRecord, ref: string): void {
	if (rec.kind === 'standing' || rec.kind === 'service') {
		throw new Error(`"${ref}" is a ${rec.kind} record — it has no runtime to stop, restart, or rebind`)
	}
}

function assertNotSelf(ctx: IdContext, rec: AgentRecord, verb: string): void {
	if (resolveSelfId(ctx) === rec.id) {
		throw new Error(`a unit cannot ${verb} its own session — run unit ${verb} ${rec.handle} from another session`)
	}
}

/** The pane a unit's runtime lives in: its record's own locator, else the pane pointer keyed by its
 * id (a herdr peer stores its pane only there). */
function runtimePane(ctx: IdContext, rec: AgentRecord): string | undefined {
	return rec.pane?.id ?? ctx.store.findPaneByAgentId(rec.id)
}

/** The adapter that owns a unit's pane: the record's own multiplexer when it names one, else the
 * backend this environment selects. Undefined when neither is available. */
function paneAdapter(ctx: RuntimeContext, rec: AgentRecord): MuxAdapter | undefined {
	if (ctx.adapter) return ctx.adapter
	if (rec.pane?.mux === 'tmux') return tmuxMuxAdapter
	if (rec.pane?.mux === 'herdr') return herdrMuxAdapter
	try {
		return selectSessionAdapter(ctx.env ?? process.env, ctx.exec ?? realExec)
	} catch {
		return undefined
	}
}

/** Record a deliberate end of the runtime: status `stopped`, no pane, the pane pointer dropped so a
 * later session in that pane (a recycled id) never resolves to this unit. Everything else is kept. */
function markStopped(ctx: IdContext, rec: AgentRecord, pane: string | undefined): AgentRecord {
	const stopped: AgentRecord = { ...rec, status: 'stopped', pane: null }
	saveAgent(ctx.store, stopped)
	if (pane) ctx.store.removePaneIndex(pane)
	return stopped
}

/** Tear down a resolved unit's runtime and record it stopped, or throw when the backend still lists
 * the pane — never recording a stop that did not happen. Shared by `stopUnit` and `restartUnit`. */
function stopRuntime(ctx: RuntimeContext, rec: AgentRecord): { agent: AgentRecord; pane?: string; verified: boolean } {
	const pane = runtimePane(ctx, rec)
	if (!pane) return { agent: markStopped(ctx, rec, undefined), verified: false }
	const exec = ctx.exec ?? realExec
	const adapter = paneAdapter(ctx, rec)
	if (!adapter) return { agent: markStopped(ctx, rec, pane), pane, verified: false }
	try {
		adapter.teardown(exec, { id: pane })
	} catch {
		// Already gone, or the call failed — the pane listing below decides which.
	}
	const listed = adapter.listPanes(exec)
	if (listed.some((p) => p.id === pane)) {
		throw new Error(
			`stop did not take effect — the backend still lists pane ${pane} for unit "${rec.handle}"; its record is unchanged`,
		)
	}
	return { agent: markStopped(ctx, rec, pane), pane, verified: listed.length > 0 }
}

/**
 * End a unit's runtime and keep the unit: tear down its pane, confirm the backend no longer lists
 * it, and mark the record `stopped` (pane-less, prune-exempt, still addressable by handle). The id,
 * handle, inbox, brief, worktree, and last-seen are left as they were.
 */
export function stopUnit(ctx: RuntimeContext, ref: string): StopResult {
	const rec = resolveAgent(ctx.store, ref)
	assertHasRuntime(rec, ref)
	assertNotSelf(ctx, rec, 'stop')
	if (rec.status === 'stopped') return { agent: rec, verified: true, alreadyStopped: true }
	return { ...stopRuntime(ctx, rec), alreadyStopped: false }
}

export interface RestartResult {
	agent: AgentRecord
	/** The pane the stop step tore down; absent when the unit had no running session. */
	previousPane?: string
	pane: string
	launch: string
	/** The new session was launched to resume the unit's recorded conversation. */
	resumed: boolean
	rung: boolean
	warning?: string
}

/**
 * Give a unit a fresh runtime and keep the unit: stop a still-running session (the same verified stop
 * as `stopUnit`), open a new session at the unit's cwd with the launch it was spawned with, bind the
 * record to the new pane, and ring it. When the record carries the harness's conversation id and the
 * harness can resume by id, the session resumes that conversation and is rung to continue, with the
 * plain launch as a shell fallback should the harness reject the id; otherwise (or with `fresh`) it
 * starts empty and is rung to read its brief — a rebrief. Every refusal runs before anything is torn
 * down.
 *
 * The unit is recorded `stopped` before the open, so a restart interrupted between the two leaves an
 * ordinary stopped unit and a rerun recovers it; nothing needs a separate repair path.
 */
export async function restartUnit(
	ctx: RuntimeContext,
	ref: string,
	options: { noWake?: boolean; fresh?: boolean; nudgeOpts?: NudgeOptions } = {},
): Promise<RestartResult> {
	const rec = resolveAgent(ctx.store, ref)
	assertHasRuntime(rec, ref)
	assertNotSelf(ctx, rec, 'restart')
	const harness = rec.harness as Harness | undefined
	if (!harness || !(harness in LAUNCH_MAP)) {
		throw new Error(
			`unit "${rec.handle}" has harness "${rec.harness ?? ''}", not in the launch map (${Object.keys(LAUNCH_MAP).join(' | ')}) — cannot restart it`,
		)
	}
	if (!existsSync(rec.cwd)) {
		throw new Error(`unit "${rec.handle}" cannot restart — its cwd ${rec.cwd} is gone; spawn a new unit instead`)
	}

	let stopped = rec
	let previousPane: string | undefined
	if (rec.status !== 'stopped') {
		const res = stopRuntime(ctx, rec)
		stopped = res.agent
		previousPane = res.pane
	}

	const env = ctx.env ?? process.env
	const exec = ctx.exec ?? realExec
	const launch = stopped.launch ?? LAUNCH_MAP[harness]
	const resume =
		stopped.conversation && !options.fresh ? resumeLaunch(harness, launch, stopped.conversation) : undefined
	// Same placement rule as spawn: a unit with its own worktree gets its own visible space; a --cwd
	// unit lives in a tab of the caller's current space.
	const at: MuxPlacement = stopped.worktree ? 'workspace' : 'tab'
	let target: { id: string }
	let adapter: MuxAdapter
	try {
		adapter = ctx.adapter ?? selectSessionAdapter(env, exec)
		const label =
			at === 'workspace'
				? { label: deriveWorkspaceLabel({ brief: ctx.store.readBrief(rec.id) ?? '', handle: rec.handle, id: rec.id }) }
				: {}
		target = adapter.open(exec, {
			cwd: stopped.cwd,
			launch: resume
				? composeLaunchLine(ctx, adapter.name, rec.id, resume, { bindSelf: true, fallback: launch })
				: composeLaunchLine(ctx, adapter.name, rec.id, launch, { bindSelf: true }),
			at,
			from: callerPane(adapter, normalizeMuxEnv(env)),
			...label,
		})
	} catch (err) {
		throw new Error(
			`restart could not open a session — unit "${rec.handle}" is stopped, with its inbox, brief, and worktree kept; ` +
				`rerun unit restart ${rec.handle}: ${err instanceof Error ? err.message : String(err)}`,
		)
	}

	const mux = adapter.name
	const bound: AgentRecord = {
		...stopped,
		status: 'active',
		pane: mux === 'tmux' || mux === 'herdr' ? { mux, id: target.id } : null,
		lastSeen: new Date(ctx.now?.() ?? Date.now()).toISOString(),
	}
	saveAgent(ctx.store, bound)
	ctx.store.putPaneIndex(target.id, rec.id)

	const briefPath = bound.brief
	const wake = await wakeSpawn(
		() => adapter,
		exec,
		{ target, briefPath: briefPath ?? '', noWake: options.noWake || !briefPath, resumed: !!resume },
		options.nudgeOpts,
	)
	return {
		agent: bound,
		...(previousPane ? { previousPane } : {}),
		pane: target.id,
		launch,
		resumed: !!resume,
		rung: wake.rung,
		...(wake.warning ? { warning: wake.warning } : {}),
	}
}

/** What the multiplexer says about a unit's runtime right now, or what its record says when the record
 * rules the runtime out. `unknown` covers both "no pane is known" and "the backend gave no answer" —
 * neither is evidence the runtime is gone. */
type Liveness = 'live' | 'gone' | 'unknown' | 'stopped' | 'exited' | 'none'

function probeLiveness(ctx: RuntimeContext, rec: AgentRecord): Liveness {
	if (rec.kind === 'standing' || rec.kind === 'service') return 'none'
	if (rec.status === 'stopped') return 'stopped'
	if (rec.status === 'exited') return 'exited'
	const pane = runtimePane(ctx, rec)
	const adapter = pane ? paneAdapter(ctx, rec) : undefined
	if (!pane || !adapter) return 'unknown'
	const listed = adapter.listPanes(ctx.exec ?? realExec)
	if (listed.length === 0) return 'unknown'
	return listed.some((p) => p.id === pane) ? 'live' : 'gone'
}

/**
 * Bind a unit to the calling pane — for a session a person started by hand (with its harness's own
 * resume flag, say) that should be this unit rather than a new one. Never takes a pane another live
 * unit holds, and never binds a unit whose runtime may still be running elsewhere: two sessions
 * answering as one unit is the failure this refuses.
 */
export function rebindUnit(ctx: RuntimeContext, ref: string): AgentRecord {
	const rec = resolveAgent(ctx.store, ref)
	assertHasRuntime(rec, ref)
	const cur = storablePane(ctx.env ?? process.env)
	if (!cur) throw new Error('unit rebind needs to run inside a tmux or herdr pane — there is no pane to bind')

	const oldPane = runtimePane(ctx, rec)
	if (rec.pane?.mux === cur.mux && rec.pane.id === cur.pane && ctx.store.resolvePaneId(cur.pane) === rec.id) {
		return rec
	}
	const holderId = ctx.store.resolvePaneId(cur.pane)
	const holder = holderId && holderId !== rec.id ? loadAgent(ctx.store, holderId) : undefined
	if (holder && holder.status !== 'stopped' && holder.status !== 'exited') {
		throw new Error(
			`this pane belongs to unit "${holder.handle}" (${holder.id}) — rebind never takes another unit's pane`,
		)
	}
	// Fail closed like service ownership: a runtime the backend cannot rule out is treated as running.
	const liveness = probeLiveness(ctx, rec)
	if (oldPane && oldPane !== cur.pane && (liveness === 'live' || liveness === 'unknown')) {
		throw new Error(
			`unit "${rec.handle}" may still be running in pane ${oldPane} — stop it first (unit stop ${rec.handle})`,
		)
	}

	const bound: AgentRecord = {
		...rec,
		status: 'active',
		pane: { mux: cur.mux, id: cur.pane },
		lastSeen: new Date(ctx.now?.() ?? Date.now()).toISOString(),
	}
	saveAgent(ctx.store, bound)
	if (oldPane && oldPane !== cur.pane) ctx.store.removePaneIndex(oldPane)
	ctx.store.putPaneIndex(cur.pane, rec.id)
	return bound
}

type Control = 'focus' | 'nudge' | 'read' | 'clear' | 'stop' | 'restart' | 'rebind' | 'close'

export interface RuntimeView {
	id: string
	handle: string
	harness?: string
	/** The status as recorded — never rewritten by looking. */
	status: string
	liveness: Liveness
	pane: { mux: string; id: string } | null
	cwd: string
	worktree: { root: string; branch?: string } | null
	/** As recorded; showing a unit invents no progress. */
	lastSeen: string
	controls: Control[]
}

function hasHonestReset(harness: string | undefined): boolean {
	if (!harness) return false
	try {
		resetCommandFor(harness)
		return true
	} catch {
		return false
	}
}

/** The controls that work on this runtime, from the record and the probed liveness — never from a
 * pane's display name, which any session can set. */
function controlsFor(ctx: RuntimeContext, rec: AgentRecord, liveness: Liveness): Control[] {
	if (liveness === 'none') return []
	const controls: Control[] = []
	if (liveness === 'live') {
		controls.push('focus', 'nudge', 'read')
		if (hasHonestReset(rec.harness)) controls.push('clear')
	}
	const hasPane = runtimePane(ctx, rec) !== undefined
	if (hasPane && (liveness === 'live' || liveness === 'gone' || liveness === 'unknown')) controls.push('stop')
	if (rec.harness && rec.harness in LAUNCH_MAP && existsSync(rec.cwd)) controls.push('restart')
	if (liveness === 'stopped' || liveness === 'exited' || liveness === 'gone') controls.push('rebind')
	controls.push('close')
	return controls
}

/**
 * The read-only runtime view an observing client polls: where the runtime is, whether the backend
 * lists it right now, and what can be done with it. Writes nothing — not the target's record, not a
 * client registration — so any number of clients can watch and reconnect without owning anything.
 */
export function showUnit(ctx: RuntimeContext, ref: string): RuntimeView {
	const rec = resolveAgent(ctx.store, ref)
	const liveness = probeLiveness(ctx, rec)
	const pane = runtimePane(ctx, rec)
	const mux = rec.pane?.mux ?? (pane ? paneAdapter(ctx, rec)?.name : undefined)
	return {
		id: rec.id,
		handle: rec.handle,
		...(rec.harness ? { harness: rec.harness } : {}),
		status: rec.status,
		liveness,
		pane: pane && mux ? { mux, id: pane } : null,
		cwd: rec.cwd,
		worktree: rec.worktree ?? null,
		lastSeen: rec.lastSeen,
		controls: controlsFor(ctx, rec, liveness),
	}
}

/**
 * Record the harness's conversation id on the calling unit, from the JSON its SessionStart hook hands
 * `mail hook` on stdin (`session_id`, which Claude Code and Codex both send). The hook fires on every
 * session start in the pane — a fresh start, a resume, a `/clear` — so the record follows the
 * conversation the pane is in now. Best-effort and silent: an unparseable input, no id, or a caller
 * that is not a unit records nothing and never fails the harness hook.
 */
export function recordConversation(ctx: IdContext, hookInput: string): void {
	let id: unknown
	try {
		id = (JSON.parse(hookInput) as { session_id?: unknown })?.session_id
	} catch {
		return
	}
	if (typeof id !== 'string' || id === '') return
	const meId = resolveSelfId(ctx)
	const rec = meId ? loadAgent(ctx.store, meId) : undefined
	if (!rec || rec.kind === 'standing' || rec.kind === 'service' || rec.conversation === id) return
	saveAgent(ctx.store, { ...rec, conversation: id })
}
