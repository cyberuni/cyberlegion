import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { selectSessionAdapter } from './console/index.ts'
import type { SessionPlacement } from './console/session.ts'
import { assertDistinctFromPrimary, gitWorktreeAdapter, resolvePrimaryRoot } from './console/worktree.ts'
import {
	type AgentRecord,
	type Harness,
	type IdContext,
	randomId,
	realExec,
	resolveSelfId,
	saveAgent,
} from './identity.ts'
import { ensureMarker, paths } from './paths.ts'

/** How each harness's own CLI is launched in the new pane. */
export const LAUNCH_MAP: Record<Harness, string> = {
	claude: 'claude',
	cursor: 'cursor-agent',
	codex: 'codex',
}

export interface SpawnInput {
	harness?: string
	task?: string
	briefFile?: string
	handle?: string
	/** Branch to create the unit's worktree on; defaults to `cyberlegion/unit-<id>`. */
	branch?: string
	/** Where to check out the unit's worktree; defaults under `<primary>/.agents/cyberlegion/worktrees/<id>`. */
	worktreePath?: string
	/** Placement relative to the caller; defaults to 'pane:right'. */
	at?: SessionPlacement
}

export interface SpawnResult {
	agent: AgentRecord
	pane: string
	launch: string
}

/**
 * Launch a new peer session as a genuine sibling unit: create a real git worktree distinct from
 * the primary checkout (refuse the primary checkout), open a session backend (tmux or herdr) with
 * its cwd set to that worktree, pre-register the peer, and drop its brief as a file the peer's own
 * SessionStart hook reads — never typed into its prompt.
 *
 * Spawned unit worktrees live project-local (`<primary>/.agents/cyberlegion/worktrees/<id>`), even
 * though the registry/mailbox itself lives in the global hub — the hub addresses units across
 * project and worktree boundaries, but a unit's checkout is necessarily project-local.
 */
export function spawn(ctx: IdContext, input: SpawnInput): SpawnResult {
	ctx.store.ensureMarker()
	const env = ctx.env ?? process.env
	const exec = ctx.exec ?? realExec
	const sessionAdapter = selectSessionAdapter(env, exec)

	const harness = input.harness as Harness | undefined
	if (!harness || !(harness in LAUNCH_MAP)) {
		throw new Error(`spawn needs a --harness in the launch map (${Object.keys(LAUNCH_MAP).join(' | ')})`)
	}
	const brief = resolveBrief(input)
	if (brief == null) {
		throw new Error('spawn needs a brief — pass --task <text>, --task - (stdin), or --brief-file <path>')
	}

	const id = randomId()
	const primaryRoot = resolvePrimaryRoot(exec)
	const branch = input.branch ?? `cyberlegion/unit-${id}`
	const worktreePath = input.worktreePath ?? paths.worktreeDir(join(primaryRoot, '.agents', 'cyberlegion'), id)
	const worktree = gitWorktreeAdapter.add(exec, { primaryRoot, path: worktreePath, branch })
	assertDistinctFromPrimary(worktree.root, primaryRoot)
	// Stamp the new worktree-unit with its own tracked marker immediately — its state hasn't been
	// committed yet, so without this the freshly spawned unit wouldn't detect itself until then.
	ensureMarker(join(worktree.root, '.agents', 'cyberlegion'))

	const launch = LAUNCH_MAP[harness]
	const target = sessionAdapter.open(exec, {
		cwd: worktree.root,
		launch: `${muxEnvPrefix(sessionAdapter.name)}${launch}`,
		at: input.at,
	})

	const ts = new Date(ctx.now?.() ?? Date.now()).toISOString()
	const rec: AgentRecord = {
		id,
		handle: input.handle ?? id.slice(0, 6),
		harness,
		cwd: worktree.root,
		worktree,
		tmux: sessionAdapter.name === 'tmux' ? { pane: target.id } : null,
		status: 'spawning',
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
 * The env prefix typed ahead of the launch command so the spawned peer inherits the caller's
 * multiplexer fast-path and never has to run its own ancestry discovery (`$CYBERLEGION_MUX` /
 * `$CYBERLEGION_MUX_PANE`). `VAR=val cmd` scopes the vars to that one process (and its children)
 * without needing `export`. tmux natively sets `$TMUX_PANE` for a pane's own processes, so the
 * pane var is expanded by the child's own shell rather than baked in here.
 */
function muxEnvPrefix(muxName: string): string {
	if (muxName === 'tmux') return 'CYBERLEGION_MUX=tmux CYBERLEGION_MUX_PANE=$TMUX_PANE '
	if (muxName === 'herdr') return 'CYBERLEGION_MUX=herdr '
	return ''
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
