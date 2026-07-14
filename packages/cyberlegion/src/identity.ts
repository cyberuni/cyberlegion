import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { basename } from 'node:path'
import { currentPane, type PaneMux, probeMultiplexer } from './console/mux-probe.ts'
import { herdrSessionAdapter } from './console/session.herdr.ts'
import { tmuxSessionAdapter } from './console/session.tmux.ts'
import type { LivePane } from './console/session.ts'
import { sanitizePane } from './paths.ts'
import type { AgentRecord, Harness, Store } from './store/store.ts'

export type { AgentRecord, Harness } from './store/store.ts'

/** Runs a command synchronously; returns trimmed stdout, or null on any failure. */
export type Exec = (cmd: string, args: string[]) => string | null

export const realExec: Exec = (cmd, args) => {
	try {
		return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
	} catch {
		return null
	}
}

export interface IdContext {
	store: Store
	env?: NodeJS.ProcessEnv
	exec?: Exec
	now?: () => number
}

const nowIso = (ctx: IdContext) => new Date(ctx.now?.() ?? Date.now()).toISOString()

export function randomId(): string {
	return randomBytes(8).toString('hex')
}

export function loadAgent(store: Store, id: string): AgentRecord | undefined {
	return store.getAgent(id)
}

export function saveAgent(store: Store, rec: AgentRecord): void {
	store.putAgent(rec)
}

export function listAgents(store: Store): AgentRecord[] {
	return store.listAgents()
}

/** Detect the harness: explicit wins, then env probes, then the tmux pane command. */
export function detectHarness(explicit: string | undefined, ctx: IdContext): Harness | undefined {
	if (explicit) {
		if (explicit === 'claude' || explicit === 'cursor' || explicit === 'codex') return explicit
		throw new Error(`unknown --harness "${explicit}" (expected claude | cursor | codex)`)
	}
	const env = ctx.env ?? process.env
	if (env.CLAUDECODE || env.CLAUDE_CODE_ENTRYPOINT) return 'claude'
	if (Object.keys(env).some((k) => k.startsWith('CURSOR'))) return 'cursor'
	if (Object.keys(env).some((k) => k.startsWith('CODEX'))) return 'codex'
	const pane = env.TMUX_PANE
	if (pane) {
		const cmd = (ctx.exec ?? realExec)('tmux', ['display-message', '-p', '-t', pane, '#{pane_current_command}'])
		if (cmd?.includes('cursor')) return 'cursor'
		if (cmd?.includes('codex')) return 'codex'
		if (cmd?.includes('claude')) return 'claude'
	}
	return undefined
}

/**
 * Recover the calling agent's own id, mux-agnostically. Inside any multiplexer pane (tmux or herdr)
 * the pane index is authoritative — a pane with no pane entry is simply unregistered and must NOT
 * adopt `$CYBERLEGION_AGENT_ID` (that env fallback applies ONLY when the session is in no
 * multiplexer pane at all). There is no shared bare "self" file — self-id is always pane-keyed or
 * explicit via the env var.
 */
export function resolveSelfId(ctx: IdContext): string | undefined {
	const env = ctx.env ?? process.env
	const cur = currentPane(env)
	if (cur) return ctx.store.resolvePaneId(cur.pane)
	return env.CYBERLEGION_AGENT_ID || undefined
}

export interface RegisterInput {
	handle?: string
	harness?: string
}

/** Register (or idempotently refresh) this session's identity. */
export function register(ctx: IdContext, input: RegisterInput): AgentRecord {
	ctx.store.ensureMarker()
	const env = ctx.env ?? process.env
	const harness = detectHarness(input.harness, ctx)
	if (!harness) {
		throw new Error('could not detect harness — pass --harness claude|cursor|codex')
	}
	const existingId = resolveSelfId(ctx)
	const existing = existingId ? loadAgent(ctx.store, existingId) : undefined
	// A caller-provided self id ($CYBERLEGION_AGENT_ID / pane index) IS this agent's id — honor it;
	// only mint a fresh id when nothing self-identifies (a fresh tmux pane).
	const id = existing?.id ?? existingId ?? randomId()
	const ts = nowIso(ctx)
	const cur = currentPane(env)
	const exec = ctx.exec ?? realExec

	const rec: AgentRecord = {
		id,
		handle: input.handle ?? existing?.handle ?? id.slice(0, 6),
		harness,
		cwd: process.cwd(),
		worktree: existing?.worktree ?? gitWorktree(exec),
		pane: cur ? paneLocator(cur, exec, env) : null,
		status: 'active',
		createdAt: existing?.createdAt ?? ts,
		lastSeen: ts,
		...(existing?.brief ? { brief: existing.brief } : {}),
		...(existing?.spawnedBy ? { spawnedBy: existing.spawnedBy } : {}),
	}
	saveAgent(ctx.store, rec)
	if (cur) ctx.store.putPaneIndex(cur.pane, id)
	return rec
}

/** Build the record's pane locator. `window`/`session` are tmux-only (herdr's pane id is
 * self-contained and its CLI needs nothing more to address a pane). */
function paneLocator(
	cur: { mux: PaneMux; pane: string },
	exec: Exec,
	env: NodeJS.ProcessEnv,
): NonNullable<AgentRecord['pane']> {
	if (cur.mux === 'tmux') {
		return {
			mux: 'tmux',
			id: cur.pane,
			window: exec('tmux', ['display-message', '-p', '-t', cur.pane, '#{window_id}']) ?? undefined,
			session: env.TMUX?.split(',')[0],
		}
	}
	return { mux: cur.mux, id: cur.pane }
}

/** Derive a standing record's stable id from its handle — same slug rule as `sanitizePane`, prefixed
 * so it reads distinct from a random 16-hex session id or a pane pointer. */
export function standingId(handle: string): string {
	return `standing-${sanitizePane(handle)}`
}

export interface RegisterStandingInput {
	handle: string
}

/**
 * Mint (or idempotently refresh) a standing identity: a session-independent, prune-exempt owner
 * inbox keyed by handle, with no pane/tmux/harness. A SIBLING of `register`, not an overload — it
 * skips all pane/tmux machinery and harness auto-detection entirely.
 */
export function registerStanding(ctx: IdContext, input: RegisterStandingInput): AgentRecord {
	ctx.store.ensureMarker()
	const id = standingId(input.handle)
	const existing = loadAgent(ctx.store, id)
	const ts = nowIso(ctx)
	const rec: AgentRecord = {
		id,
		handle: input.handle,
		kind: 'standing',
		pane: null,
		harness: undefined,
		cwd: process.cwd(),
		status: 'active',
		createdAt: existing?.createdAt ?? ts,
		lastSeen: ts,
	}
	saveAgent(ctx.store, rec)
	return rec
}

function gitWorktree(exec: Exec): { root: string; branch?: string } | null {
	const root = exec('git', ['rev-parse', '--show-toplevel'])
	if (!root) return null
	return { root, branch: exec('git', ['rev-parse', '--abbrev-ref', 'HEAD']) ?? undefined }
}

/** Prefer a standing record over a plain session record when both match a handle — an owner
 * report must land in the durable standing inbox, not a dying session's. */
function preferStanding(matches: AgentRecord[]): AgentRecord | undefined {
	return matches.find((a) => a.kind === 'standing') ?? matches[0]
}

/** Split a handle's matches into live and exited. An exited unit's pane is gone and its inbox has
 * no reader, so a *name* must never resolve to one — a handle is reusable across units, and the
 * dead holders of it outnumber the live one over time. Standing records never exit. An explicit id
 * still resolves either way: naming a unit outright is a deliberate choice, unlike reaching for a
 * handle and silently landing on a corpse. */
function matchHandle(agents: AgentRecord[], handle: string): { live: AgentRecord[]; exited: AgentRecord[] } {
	const matched = agents.filter((a) => a.handle === handle)
	return {
		live: matched.filter((a) => a.status !== 'exited'),
		exited: matched.filter((a) => a.status === 'exited'),
	}
}

/** Fail loudly when a handle names only the dead — never fall through to a corpse. */
function unaddressable(ref: string, exited: AgentRecord[], tried: string): Error {
	if (exited.length > 0) {
		const dead = exited.map((a) => `${a.id.slice(0, 6)}${a.pane ? ` (${a.pane.id})` : ''}`).join(', ')
		return new Error(
			`"${ref}" matches only exited unit(s) — ${dead} — which have no reader. ` +
				`Address a live unit ('cyberlegion unit who'), or run 'cyberlegion unit register --standing --handle ${ref}' for a durable inbox.`,
		)
	}
	return new Error(`no agent addressable as "${ref}" (tried ${tried})`)
}

/** Resolve a handle to its standing owner record's id — never falls back to a live session agent
 * sharing that handle, so `--owner` can never be pointed at a session's inbox by mistake. */
export function resolveStandingOwner(store: Store, handle: string): string {
	const match = listAgents(store).find((a) => a.handle === handle && a.kind === 'standing')
	if (!match) {
		throw new Error(`no standing owner "${handle}" — run 'cyberlegion unit register --standing --handle ${handle}'`)
	}
	return match.id
}

/**
 * Bind the caller's own unit as a standing owner's presence — the live unit standing in for a
 * durable record that has no session of its own. Order matters: resolve the standing record first
 * (an unknown handle throws via `resolveStandingOwner` — fail-loud, never auto-mints), THEN gate on
 * spawn capability, THEN resolve the caller's own id — so an unknown handle or a caller with no
 * multiplexer never touches the pointer. Last claim wins: a plain overwrite, no merge.
 */
export function claimPresence(ctx: IdContext, handle: string): AgentRecord {
	const rec = loadAgent(ctx.store, resolveStandingOwner(ctx.store, handle))
	if (!rec)
		throw new Error(`no standing owner "${handle}" — run 'cyberlegion unit register --standing --handle ${handle}'`)
	// Gated on spawn capability, not on what kind of agent asks: a caller with no multiplexer has no
	// dispatch mechanism to act on what the mailbox delivers, so it cannot claim — checked BEFORE any
	// write, leaving the pointer untouched. Never introspect whether the caller is a subagent/fork.
	const probe = probeMultiplexer(ctx.exec ?? realExec, ctx.env ?? process.env)
	if (probe.mux === 'none') {
		throw new Error('claiming a presence needs a multiplexer to open panes')
	}
	const selfId = resolveSelfId(ctx)
	if (!selfId) {
		throw new Error('no identity in this session — run `cyberlegion unit register` first')
	}
	rec.presence = selfId
	saveAgent(ctx.store, rec)
	return rec
}

/**
 * Unbind a standing owner's presence. The unknown-handle throw (via `resolveStandingOwner`) wins
 * over this call's own tolerance: `--clear` is forgiving about *nothing being bound* (a no-op, never
 * an error), never about *the owner not existing* — a typo'd handle fails loudly instead of silently
 * reporting a clear it never performed.
 */
export function clearPresence(ctx: IdContext, handle: string): AgentRecord {
	const rec = loadAgent(ctx.store, resolveStandingOwner(ctx.store, handle))
	if (!rec)
		throw new Error(`no standing owner "${handle}" — run 'cyberlegion unit register --standing --handle ${handle}'`)
	if (rec.presence !== undefined) {
		rec.presence = undefined
		saveAgent(ctx.store, rec)
	}
	return rec
}

/**
 * The live-only presence rule, keyed off a standing record the caller ALREADY HOLDS — the pointer
 * records a unit id, and that unit can exit while the standing record it stands in for never does,
 * so a presence whose unit is missing or `status: exited` reads as no presence bound, exactly as if
 * none were ever claimed. Nothing here self-heals the stale pointer; it stays inert until re-claimed
 * via `claimPresence`.
 *
 * Separate from `resolvePresence` because this one is INCAPABLE of throwing: the delivery doorbell
 * must never fail a send that already landed durably, so it cannot resolve the presence through a
 * handle-resolving path that throws when the standing record races away underneath it (a concurrent
 * `unit close`/`decommission` between loading the recipient and reading its presence). It is also
 * strictly cheaper — no O(n) registry scan to re-find a record the caller is holding.
 */
export function presenceOf(store: Store, rec: AgentRecord): AgentRecord | undefined {
	if (!rec.presence) return undefined
	const presenceUnit = loadAgent(store, rec.presence)
	if (!presenceUnit || presenceUnit.status === 'exited') return undefined
	return presenceUnit
}

/**
 * Resolve a standing owner's presence by handle, live-only (`presenceOf`). The handle-keyed front
 * door for the CLI read path: it keeps the fail-loud unknown-handle throw (via `resolveStandingOwner`)
 * so `unit claim <handle> --show` on a typo'd handle errors rather than reporting a definitive `none`
 * for an owner that does not exist.
 */
export function resolvePresence(store: Store, handle: string): AgentRecord | undefined {
	const rec = loadAgent(store, resolveStandingOwner(store, handle))
	if (!rec) return undefined
	return presenceOf(store, rec)
}

/** Resolve a recipient argument (id or handle) to an agent id. A handle resolves to live units
 * only — mail addressed to an exited unit lands in an inbox nobody reads. */
export function resolveRecipient(store: Store, to: string): string {
	if (loadAgent(store, to)) return to
	const { live, exited } = matchHandle(listAgents(store), to)
	const match = preferStanding(live)
	if (!match) throw unaddressable(to, exited, 'id and handle')
	return match.id
}

/**
 * Resolve a unit reference by id, handle, or its worktree branch (the unit↔CR join key: an
 * `AgentRecord.worktree.branch` equals the SDD `<cr-ref>` it maps to, when spawned for one). Used
 * by verbs that address "the unit working on CR X" as well as "the unit named X".
 */
export function resolveAgent(store: Store, ref: string): AgentRecord {
	const byId = loadAgent(store, ref)
	if (byId) return byId
	const agents = listAgents(store)
	const { live, exited } = matchHandle(agents, ref)
	const byHandle = preferStanding(live)
	if (byHandle) return byHandle
	const byBranchAll = agents.filter((a) => a.worktree?.branch === ref)
	const byBranch = byBranchAll.find((a) => a.status !== 'exited')
	if (byBranch) return byBranch
	const dead = [...exited, ...byBranchAll.filter((a) => a.status === 'exited')].filter(
		(a, i, all) => all.findIndex((b) => b.id === a.id) === i,
	)
	throw unaddressable(ref, dead, 'id, handle, and worktree branch/CR')
}

export function bumpLastSeen(ctx: IdContext, id: string): void {
	const rec = loadAgent(ctx.store, id)
	if (!rec) return
	rec.lastSeen = nowIso(ctx)
	saveAgent(ctx.store, rec)
}

/** Refresh this session's own last-seen if it is registered — best-effort, never throws. */
export function touch(ctx: IdContext): void {
	const id = resolveSelfId(ctx)
	if (id) bumpLastSeen(ctx, id)
}

const STALE_MS = 15 * 60 * 1000

/** The per-mux session adapters `prune` consults for pane liveness — each answers with its own
 * backend primitive so a herdr pane is never probed with a tmux query, and vice versa. */
const PANE_ADAPTERS = { tmux: tmuxSessionAdapter, herdr: herdrSessionAdapter } as const

/** Map a backend-reported agent string to a known harness — substring-matched like the tmux
 * pane-command probe in `detectHarness`; anything else is unclassifiable. */
function harnessFromAgent(agent: string | undefined): Harness | undefined {
	if (!agent) return undefined
	if (agent.includes('cursor')) return 'cursor'
	if (agent.includes('codex')) return 'codex'
	if (agent.includes('claude')) return 'claude'
	return undefined
}

/**
 * Adopt half of reconcile-against-mux: mint a record for each live pane with a detectable harness
 * and no matching record — bind pane→id, handle from the pane's reported cwd basename (sanitized;
 * `id.slice(0, 6)` when the backend reports no cwd), status active, lastSeen now. A pane is bound —
 * and never adopted — when its pane index resolves to an existing record or any record (any status,
 * exited included) bears it; resurrecting an exited record is the in-pane session's own `register`
 * via the pane pointer, never reconcile's. tmux panes carry no harness signal, so only herdr panes
 * are adoptable today.
 */
function adopt(ctx: IdContext, panes: LivePane[]): AgentRecord[] {
	const agents = listAgents(ctx.store)
	const adopted: AgentRecord[] = []
	for (const pane of panes) {
		const harness = harnessFromAgent(pane.harness)
		if (!harness) continue
		const boundId = ctx.store.resolvePaneId(pane.id)
		if (boundId && loadAgent(ctx.store, boundId)) continue
		if (agents.some((a) => a.pane?.mux === pane.mux && a.pane.id === pane.id)) continue
		const id = randomId()
		const ts = nowIso(ctx)
		const rec: AgentRecord = {
			id,
			handle: pane.cwd ? sanitizePane(basename(pane.cwd)) : id.slice(0, 6),
			harness,
			cwd: pane.cwd ?? '',
			pane: { mux: pane.mux, id: pane.id },
			status: 'active',
			createdAt: ts,
			lastSeen: ts,
		}
		saveAgent(ctx.store, rec)
		ctx.store.putPaneIndex(pane.id, id)
		adopted.push(rec)
	}
	return adopted
}

/**
 * Cull dead records against the current mux's live pane set (the mux the caller is actually inside,
 * per `currentPane`) — mux-scoped: it never declares the *other* mux's records dead, since it can't
 * enumerate them. Standing records are exempt; a `pane: null` record can't be pane-culled by
 * enumeration (left to `prune`'s staleness timer). Outside any multiplexer pane there is nothing to
 * enumerate, so it culls nothing. With `adopt` set (the `who --reconcile` path — `prune` stays
 * cull-only), the same live set also feeds adoption of unbound harness-bearing panes.
 */
export function reconcile(ctx: IdContext, opts?: { adopt?: boolean }): AgentRecord[] {
	const exec = ctx.exec ?? realExec
	const env = ctx.env ?? process.env
	const cur = currentPane(env)
	if (!cur) return []
	const panes = PANE_ADAPTERS[cur.mux].listPanes(exec)
	const live = new Set(panes.map((p) => p.id))
	const changed: AgentRecord[] = []
	for (const rec of listAgents(ctx.store)) {
		if (rec.kind === 'standing') continue
		if (rec.status === 'exited') continue
		if (!rec.pane) continue
		if (rec.pane.mux !== cur.mux) continue
		if (!live.has(rec.pane.id)) {
			rec.status = 'exited'
			saveAgent(ctx.store, rec)
			changed.push(rec)
		}
	}
	if (opts?.adopt) changed.push(...adopt(ctx, panes))
	return changed
}

/** Mark agents whose pane is gone or whose last-seen is stale as exited. Reconcile-culls against the
 * current mux's live set first, then falls through to the per-record paneExists + staleness check
 * (covers the other mux and sessions outside any multiplexer pane). */
export function prune(ctx: IdContext): AgentRecord[] {
	const exec = ctx.exec ?? realExec
	const now = ctx.now?.() ?? Date.now()
	const changed: AgentRecord[] = reconcile(ctx)
	for (const rec of listAgents(ctx.store)) {
		if (rec.kind === 'standing') continue
		if (rec.status === 'exited') continue
		const paneGone = rec.pane ? !PANE_ADAPTERS[rec.pane.mux].paneExists(exec, { id: rec.pane.id }) : false
		const stale = now - new Date(rec.lastSeen).getTime() > STALE_MS
		if (paneGone || stale) {
			rec.status = 'exited'
			saveAgent(ctx.store, rec)
			changed.push(rec)
		}
	}
	return changed
}
