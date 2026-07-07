import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
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
 * Recover the calling agent's own id. In tmux the pane index is authoritative — a pane with no
 * pane entry is simply unregistered and must NOT adopt `$CYBERLEGION_AGENT_ID` (that env fallback
 * applies only when there is no `$TMUX_PANE`). There is no shared bare "self" file — self-id is
 * always pane-keyed or explicit via the env var.
 */
export function resolveSelfId(ctx: IdContext): string | undefined {
	const env = ctx.env ?? process.env
	const pane = env.TMUX_PANE
	if (pane) return ctx.store.resolvePaneId(pane)
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
	const pane = env.TMUX_PANE
	const exec = ctx.exec ?? realExec

	const rec: AgentRecord = {
		id,
		handle: input.handle ?? existing?.handle ?? id.slice(0, 6),
		harness,
		cwd: process.cwd(),
		worktree: existing?.worktree ?? gitWorktree(exec),
		tmux: pane
			? {
					pane,
					window: exec('tmux', ['display-message', '-p', '-t', pane, '#{window_id}']) ?? undefined,
					session: env.TMUX?.split(',')[0],
				}
			: null,
		status: 'active',
		createdAt: existing?.createdAt ?? ts,
		lastSeen: ts,
		...(existing?.brief ? { brief: existing.brief } : {}),
		...(existing?.spawnedBy ? { spawnedBy: existing.spawnedBy } : {}),
	}
	saveAgent(ctx.store, rec)
	if (pane) ctx.store.putPaneIndex(pane, id)
	return rec
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
		tmux: null,
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

/** Resolve a recipient argument (id or handle) to an agent id. */
export function resolveRecipient(store: Store, to: string): string {
	if (loadAgent(store, to)) return to
	const matches = listAgents(store).filter((a) => a.handle === to)
	const match = preferStanding(matches)
	if (!match) {
		throw new Error(
			`no agent addressable as "${to}" — run 'cyberlegion identity owner --handle ${to}' to create a standing inbox`,
		)
	}
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
	const byHandle = preferStanding(agents.filter((a) => a.handle === ref))
	if (byHandle) return byHandle
	const byBranch = agents.find((a) => a.worktree?.branch === ref)
	if (byBranch) return byBranch
	throw new Error(`no agent addressable as "${ref}" (tried id, handle, and worktree branch/CR)`)
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

/** Mark agents whose pane is gone or whose last-seen is stale as exited. */
export function prune(ctx: IdContext): AgentRecord[] {
	const exec = ctx.exec ?? realExec
	const now = ctx.now?.() ?? Date.now()
	const changed: AgentRecord[] = []
	for (const rec of listAgents(ctx.store)) {
		if (rec.kind === 'standing') continue
		if (rec.status === 'exited') continue
		const paneGone = rec.tmux?.pane
			? exec('tmux', ['has-session', '-t', rec.tmux.pane]) === null &&
				!(exec('tmux', ['list-panes', '-a', '-F', '#{pane_id}']) ?? '').split('\n').includes(rec.tmux.pane)
			: false
		const stale = now - new Date(rec.lastSeen).getTime() > STALE_MS
		if (paneGone || stale) {
			rec.status = 'exited'
			saveAgent(ctx.store, rec)
			changed.push(rec)
		}
	}
	return changed
}
