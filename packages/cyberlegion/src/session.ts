import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { callerPane, type MuxPlacement, type MuxTarget, type NudgeOptions } from 'cyber-mux'
import { assertDistinctFromPrimary, gitWorktreeAdapter, resolvePrimaryRoot } from 'cyber-mux/worktree'
import { wakeSpawn } from './console/doorbell.ts'
import {
	type AgentRecord,
	type Harness,
	type IdContext,
	randomId,
	realExec,
	resolveAgent,
	resolveSelfId,
	saveAgent,
} from './identity.ts'
import { normalizeMuxEnv } from './mux-env.ts'
import { selectSessionAdapter } from './mux-select.ts'
import { ensureMarker, paths, resolveUnitWorktreePath } from './paths.ts'
import { deriveWorkspaceLabel } from './workspace-label.ts'

/** How each harness's own CLI is launched in the new pane. */
export const LAUNCH_MAP: Record<Harness, string> = {
	claude: 'claude',
	cursor: 'cursor-agent',
	codex: 'codex',
}

/**
 * Per-harness fresh-context ("reset") command `clear` injects into a warm peer's pane to return
 * its conversation to a cold context without tearing the pane/session down — keyed on genuine
 * fresh-context semantics, never on the literal word "clear".
 */
const RESET_MAP: Record<string, string> = {
	claude: '/clear',
	codex: '/clear',
	copilot: '/clear',
	cursor: '/new-chat',
}

/**
 * Harnesses whose apparent "clear" command does NOT truly empty the model context — e.g. gemini's
 * `/clear` wipes only the terminal screen, leaving the model's own context stale. There is no
 * honest fresh-context command for these, so they are refused explicitly rather than lumped in
 * with a harness that is merely unmapped.
 */
const FALSE_FRIEND_HARNESSES = new Set(['gemini'])

/**
 * Resolve `harness`'s own fresh-context command from the reset map. String-keyed (not `Harness`)
 * so it also guards a harness present in `LAUNCH_MAP`/`identity.ts`'s `Harness` union but not yet
 * given an honest reset mapping here. Throws rather than guessing:
 * - a known false-friend harness (its "clear" only clears the screen, not the context)
 * - any harness absent from the map entirely
 */
export function resetCommandFor(harness: string): string {
	const mapped = RESET_MAP[harness]
	if (mapped) return mapped
	if (FALSE_FRIEND_HARNESSES.has(harness)) {
		throw new Error(
			`"${harness}" has no honest fresh-context command — its own "/clear" clears only the terminal screen, ` +
				'not the model context, so unit clear refuses to send a false-friend reset that would leave stale context behind',
		)
	}
	throw new Error(
		`"${harness}" is not in the reset map (${Object.keys(RESET_MAP).join(' | ')}) — unit clear refuses to guess a command`,
	)
}

export interface SpawnInput {
	harness?: string
	task?: string
	briefFile?: string
	handle?: string
	/** Override the default per-harness launch command (e.g. an agent-def's `realizeLaunch` output,
	 * carrying `--model`/`--append-system-prompt`) — composed in by callers, never by `spawn` itself
	 * (avoids a session.ts ↔ agentdef/realize.ts import cycle, since `realizeLaunch` already reads
	 * `LAUNCH_MAP` from here). */
	command?: string
	/** Branch to create the unit's worktree on; defaults to `cyberlegion/unit-<id>`. */
	branch?: string
	/** Where to check out the unit's worktree; defaults to a sibling of the primary checkout
	 * (`<parent>/<repo>.worktrees/legion-<id6>`, `id6` the same 6-char slice `handle` defaults to)
	 * — never nested inside the primary's own tree. */
	worktreePath?: string
	/** Spawn into this existing directory instead — creates no worktree. Mutually exclusive with
	 * `branch`/`worktreePath` (those create a worktree; this reuses one). */
	cwd?: string
	/** Placement relative to the caller; defaults to 'tab'. */
	at?: MuxPlacement
}

export interface SpawnResult {
	agent: AgentRecord
	pane: string
	launch: string
}

/**
 * Launch a new peer session as a genuine sibling unit: create a real git worktree distinct from
 * the primary checkout (refuse the primary checkout), open a session backend (tmux or herdr) with
 * its cwd set to that worktree, pre-register the peer, and drop its brief as a file — never typed
 * into its prompt. Nothing loads that file for the peer: it is the spawn wake that tells the peer to
 * go read it, naming its path (`spawnAndWake` below, and ADR-0032). `spawn` alone therefore leaves a
 * peer sitting idle with its brief unread, which is why callers want `spawnAndWake`.
 *
 * Spawned unit worktrees live sibling to the primary checkout (`<parent>/<repo>.worktrees/legion-<id6>`),
 * never nested inside it, even though the registry/mailbox itself lives in the global hub — the hub
 * addresses units across project and worktree boundaries, but a unit's checkout is necessarily
 * scoped to this one project's git remote.
 */
export function spawn(ctx: IdContext, input: SpawnInput): SpawnResult {
	ctx.store.ensureMarker()
	const env = ctx.env ?? process.env
	const exec = ctx.exec ?? realExec
	const sessionAdapter = selectSessionAdapter(env, exec)
	const normalizedEnv = normalizeMuxEnv(env)

	const harness = input.harness as Harness | undefined
	if (!harness || !(harness in LAUNCH_MAP)) {
		throw new Error(`spawn needs a --harness in the launch map (${Object.keys(LAUNCH_MAP).join(' | ')})`)
	}
	const brief = resolveBrief(input)
	if (brief == null) {
		throw new Error('spawn needs a brief — pass --task <text>, --task - (stdin), or --brief-file <path>')
	}

	if (input.cwd && (input.branch || input.worktreePath)) {
		throw new Error('--cwd cannot combine with the worktree-creating flags --branch/--worktree-path')
	}

	const id = randomId()
	const primaryRoot = resolvePrimaryRoot(exec)
	const launch = input.command ?? LAUNCH_MAP[harness]
	const fullLaunch = `${muxEnvPrefix(sessionAdapter.name)}${launch}`
	// A pane placement splits the CALLER's own pane, never whichever pane the backend defaults to —
	// each backend's own default tracks the pane a HUMAN is looking at, which diverges exactly when a
	// program is driving, which spawn always is (mux.feature: "a pane placement splits the calling
	// pane, not whichever pane is active"). Ignored by tab/workspace opens, which split nothing.
	const from = callerPane(sessionAdapter, normalizedEnv)

	let cwd: string
	let worktree: { root: string; branch: string } | null
	let target: MuxTarget
	if (input.cwd) {
		if (!existsSync(input.cwd)) {
			throw new Error(`--cwd directory must already exist: ${input.cwd}`)
		}
		cwd = resolve(input.cwd)
		assertDistinctFromPrimary(cwd, primaryRoot)
		worktree = null
		// A --cwd spawn reuses the caller's current space, so its default placement is a tab there —
		// the caller opted into an existing dir, not into carving out an isolated space.
		const at = input.at ?? 'tab'
		target = sessionAdapter.open(exec, { cwd, launch: fullLaunch, at, from, ...labelFor(at, input, brief, id) })
	} else {
		const branch = input.branch ?? `cyberlegion/unit-${id}`
		// A spawn that CREATES A NEW WORKTREE gets its own isolated, VISIBLE space by default — the
		// fleet-layer caller expresses that intent as `workspace`, never a mux-specific placement.
		// Mapped per-mux: herdr nests a new workspace under its source; tmux (no Workspace tier) opens
		// a visible window. Deterministic — independent of whichever workspace is currently focused.
		const at = input.at ?? 'workspace'
		// Sliced to 6 hex chars — matches the same default the record's own `handle` uses below, so
		// the directory name lines up with what's already shown to the caller.
		const worktreePath = input.worktreePath ?? resolveUnitWorktreePath(primaryRoot, id.slice(0, 6))
		if (at === 'workspace' && sessionAdapter.worktree) {
			// The backend can create the worktree and open its new workspace in one atomic call —
			// a real organizational improvement (herdr nests the worktree under its source workspace)
			// over a separate worktree-add followed by a disconnected open().
			const opened = sessionAdapter.worktree.createInWorkspace(exec, {
				primaryRoot,
				branch,
				path: worktreePath,
				launch: fullLaunch,
				...labelFor(at, input, brief, id),
			})
			assertDistinctFromPrimary(opened.worktree.root, primaryRoot)
			ensureMarker(join(opened.worktree.root, '.agents', 'cyberlegion'))
			cwd = opened.worktree.root
			worktree = opened.worktree
			target = opened.target
		} else {
			const added = gitWorktreeAdapter.add(exec, { primaryRoot, path: worktreePath, branch })
			assertDistinctFromPrimary(added.root, primaryRoot)
			// Stamp the new worktree-unit with its own tracked marker immediately — its state hasn't
			// been committed yet, so without this the freshly spawned unit wouldn't detect itself
			// until then.
			ensureMarker(join(added.root, '.agents', 'cyberlegion'))
			cwd = added.root
			worktree = added
			target = sessionAdapter.open(exec, { cwd, launch: fullLaunch, at, from, ...labelFor(at, input, brief, id) })
		}
	}

	const ts = new Date(ctx.now?.() ?? Date.now()).toISOString()
	const muxName = sessionAdapter.name
	const rec: AgentRecord = {
		id,
		handle: input.handle ?? id.slice(0, 6),
		harness,
		cwd,
		worktree,
		// Tag the pane with its multiplexer so the unit's own `prune` runs the right liveness check.
		pane: muxName === 'tmux' || muxName === 'herdr' ? { mux: muxName, id: target.id } : null,
		status: 'active',
		createdAt: ts,
		lastSeen: ts,
		brief: paths.briefFile(ctx.store.root, id),
		...(resolveSelfId(ctx) ? { spawnedBy: resolveSelfId(ctx) } : {}),
	}
	saveAgent(ctx.store, rec)
	ctx.store.putPaneIndex(target.id, id)
	ctx.store.writeBrief(id, brief)

	return { agent: rec, pane: target.id, launch }
}

/**
 * `unit spawn` end to end: open the peer, then deliver its first turn.
 *
 * The two acts live together here rather than at the CLI call site so the **brief path the doorbell
 * names is derived from the record `spawn` just wrote**, not handed in by a caller. That is the
 * point of the seam: a caller cannot ring with the wrong string, because it supplies no string. The
 * impl gate caught exactly that hole — with the path passed in from `cli.ts`, both "the doorbell
 * names the brief's path" and "it does not carry the brief's body" stayed green while the call site
 * passed an empty string, or the brief's whole body.
 *
 * The ring is best-effort on top of the guaranteed spawn effect (worktree + session + registry
 * record): `--no-wake` rings nothing, and a ring that never completes is reported as a warning on
 * the result rather than thrown, so it can never fail a spawn that already landed.
 */
export async function spawnAndWake(
	ctx: IdContext,
	input: SpawnInput,
	options: { noWake?: boolean; nudgeOpts?: NudgeOptions } = {},
): Promise<SpawnResult & { rung: boolean; warning?: string }> {
	const res = spawn(ctx, input)
	const env = ctx.env ?? process.env
	const exec = ctx.exec ?? realExec
	// `spawn` always records where it wrote the brief. The guard is not defensive padding: a doorbell
	// with no path to name is not an instruction, so ring nothing rather than type the degenerate
	// "Read your brief at , then begin work." — a silent half-wake is worse than an unrung peer.
	const briefPath = res.agent.brief
	const wake = await wakeSpawn(
		() => selectSessionAdapter(env, exec),
		exec,
		{ target: { id: res.pane }, briefPath: briefPath ?? '', noWake: options.noWake || !briefPath },
		options.nudgeOpts,
	)
	return { ...res, rung: wake.rung, ...(wake.warning ? { warning: wake.warning } : {}) }
}

/**
 * The label a `workspace` placement opens under — the short human-scannable name that makes a unit's
 * own visible space findable by eye (`console/workspace-label.ts` owns the naming rule). Only the
 * `workspace` placement carries one: a pane or tab lives inside a space the caller is already
 * looking at, so it has nothing of its own to name. Spread into the adapter options, so a
 * non-workspace placement passes no `label` key at all rather than an explicit `undefined`.
 *
 * The gate is load-bearing, not defensive: cyber-mux names whatever tier `at` opens — a workspace,
 * a tab, or a pane — so passing a label on a `tab` placement would rename the caller's own tab.
 * Exported so that gate is tested directly rather than only through a backend's arguments.
 */
export function labelFor(
	at: MuxPlacement,
	input: SpawnInput,
	brief: string,
	id: string,
): { label: string } | Record<string, never> {
	if (at !== 'workspace') return {}
	return { label: deriveWorkspaceLabel({ brief, handle: input.handle, id }) }
}

/**
 * The env prefix typed ahead of the launch command so the spawned peer inherits the caller's
 * multiplexer fast-path and never has to run its own ancestry discovery (`$CYBER_MUX` /
 * `$CYBER_MUX_PANE`). `VAR=val cmd` scopes the vars to that one process (and its children)
 * without needing `export`. tmux natively sets `$TMUX_PANE` for a pane's own processes, so the
 * pane var is expanded by the child's own shell rather than baked in here.
 */
function muxEnvPrefix(muxName: string): string {
	if (muxName === 'tmux') return 'CYBER_MUX=tmux CYBER_MUX_PANE=$TMUX_PANE '
	if (muxName === 'herdr') return 'CYBER_MUX=herdr '
	return ''
}

export interface ClearResult {
	agent: AgentRecord
	pane: string
	command: string
}

/**
 * Reset a warm peer's context to cold WITHOUT tearing anything down — injects the peer's own
 * harness fresh-context command (`resetCommandFor`) into its pane through the session adapter.
 * Warmth is the unit (pane/process stays warm — no cold-start), coldness is the context. The
 * command is resolved (and any false-friend/unmapped harness throws) BEFORE anything is sent, so
 * a fail-loud harness never has anything typed into its pane. Touches neither the registry record
 * nor the worktree — `close` (`decommission`) owns teardown.
 */
export function clearUnit(ctx: IdContext, ref: string): ClearResult {
	const agent = resolveAgent(ctx.store, ref)
	const pane = agent.pane?.id ?? ctx.store.findPaneByAgentId(agent.id)
	if (!pane) throw new Error(`unit "${ref}" has no known session pane`)
	if (!agent.harness) throw new Error(`unit "${ref}" has no harness on record — cannot resolve its reset command`)
	// Resolve (and validate) the reset command before sending anything — a false-friend or
	// unmapped harness must fail loud with nothing injected into the pane.
	const command = resetCommandFor(agent.harness)
	const env = ctx.env ?? process.env
	const exec = ctx.exec ?? realExec
	// `submit`, not `sendText` — cyber-mux's `sendText` types literal characters and presses NO Enter
	// (the text is left staged in the pane's input box), while the old fork's `send()` this replaces
	// typed the reset command AND pressed Enter atomically. A one-shot reset command has to actually
	// run, so `submit(exec, target, text)` — "type text, then always press Enter" — is the equivalent
	// primitive here, not `sendText`.
	selectSessionAdapter(env, exec).submit(exec, { id: pane }, command)
	return { agent, pane, command }
}

/** Resolve a spawn brief from --brief-file, --task -, or --task <text>; null if no source given. */
export function resolveBrief(
	input: SpawnInput,
	readStdin: () => string = () => readFileSync(0, 'utf8'),
): string | null {
	if (input.briefFile) return readFileSync(input.briefFile, 'utf8')
	if (input.task === '-') return readStdin()
	if (input.task != null && input.task !== '') return input.task
	return null
}
