import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { resolvePrimaryRoot } from 'cyber-mux/worktree'

/** The tracked marker file that makes a hub root initialized (see ensureMarker). */
const MARKER_FILE = 'config.json'

/** Walk up from `cwd` to the nearest git repo root; fall back to `cwd`. */
export function projectRoot(cwd: string = process.cwd()): string {
	let dir = resolve(cwd)
	for (;;) {
		if (existsSync(join(dir, '.git'))) return dir
		const parent = dirname(dir)
		if (parent === dir) return resolve(cwd)
		dir = parent
	}
}

/** Runs a command synchronously in `cwd`; returns trimmed stdout, or null on any failure. */
type Exec = (cmd: string, args: string[]) => string | null

function makeDefaultExec(cwd: string | undefined): Exec {
	return (cmd, args) => {
		try {
			return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], cwd }).trim()
		} catch {
			return null
		}
	}
}

export interface RootOptions {
	root?: string
	space?: string
	cwd?: string
	env?: NodeJS.ProcessEnv
	exec?: Exec
}

/**
 * Resolve the cyberlegion hub root. Precedence: explicit --root/--space, then `$CYBERLEGION_ROOT`,
 * then the GLOBAL hub `~/.agents/cyberlegion` (addressable across every project and worktree
 * boundary — identity/mail/registry state lives here by default; `--space` isolates it), falling
 * back to a project-local `.agents/cyberlegion` only when no home directory is resolvable.
 */
export function resolveRoot(opts: RootOptions = {}): string {
	const env = opts.env ?? process.env
	const explicit = opts.root ?? opts.space ?? env.CYBERLEGION_ROOT
	if (explicit) return resolve(explicit)
	const home = homedir()
	if (home) return join(home, '.agents', 'cyberlegion')
	return join(projectRoot(opts.cwd), '.agents', 'cyberlegion')
}

/**
 * Resolve the primary checkout's project-local cyberlegion dir — the tracked marker for a
 * legion-enabled project (never the global hub, and never where spawned unit worktrees themselves
 * are checked out — see `resolveUnitWorktreePath`), keyed off `git worktree`'s common-dir so it
 * resolves the same from the primary checkout or from any of its linked worktrees.
 */
export function resolveProjectLocalRoot(opts: RootOptions = {}): string {
	const exec = opts.exec ?? makeDefaultExec(opts.cwd)
	let primary: string | undefined
	try {
		primary = resolvePrimaryRoot(exec)
	} catch {
		primary = undefined
	}
	return join(primary ?? projectRoot(opts.cwd), '.agents', 'cyberlegion')
}

/**
 * Create the tracked `config.json` marker at `root` (a hub root) if it does not already exist.
 * Callers pass the root under which the marker should be created/ensured; this mkdir's it as
 * needed. Idempotent — never overwrites an existing marker.
 */
export function ensureMarker(root: string): void {
	mkdirSync(root, { recursive: true })
	const marker = join(root, MARKER_FILE)
	if (!existsSync(marker)) {
		writeFileSync(marker, `${JSON.stringify({ version: 1 }, null, 2)}\n`)
	}
}

/**
 * Thrown when an agent/message id destined to become a filename PATH SEGMENT fails
 * `assertSafeId` — see that function's doc for why this rejects rather than encodes.
 */
export class InvalidIdError extends Error {
	constructor(
		public readonly kind: string,
		public readonly value: string,
	) {
		super(`invalid ${kind} ${JSON.stringify(value)} — must not be empty, ".", "..", or contain a path separator`)
		this.name = 'InvalidIdError'
	}
}

const UNSAFE_ID = /[\\/\0]/

/**
 * Filename-safety guard for any id that becomes a bare PATH SEGMENT under the hub root — agent ids
 * (`agentFile`/`inboxDir`/`dataDir`/`briefFile`) and message ids (`messageFile`). Both are
 * effectively user/peer-controlled: an agent id round-trips a caller-supplied `--handle`-adjacent
 * value in some flows, and nothing upstream of the store validates it before it reaches a `join()`.
 *
 * REJECT, don't encode: unlike `sanitizePane` (which deliberately encodes, because a tmux/herdr pane
 * locator is an opaque, internally-produced token that only needs to survive as a *lookup key*, not
 * round-trip as an identity), an agent/message id is a PRIMARY KEY — `getAgent(id)` must return
 * exactly what `putAgent` stored under that same `id`. Silently encoding two different malformed ids
 * onto the same sanitized filename would let one caller's write silently clobber or read another's
 * record — a worse failure than a loud, immediate refusal. So: empty, `.`, `..`, and any embedded
 * path separator (POSIX `/`, Windows `\`) or NUL byte are rejected outright, which also rejects an
 * absolute path outright (an absolute path always contains a separator).
 */
export function assertSafeId(id: string, kind: string): string {
	if (!id || id === '.' || id === '..' || UNSAFE_ID.test(id)) {
		throw new InvalidIdError(kind, id)
	}
	return id
}

export const paths = {
	agentsDir: (root: string) => join(root, 'agents'),
	agentFile: (root: string, id: string) => join(root, 'agents', `${assertSafeId(id, 'agent id')}.json`),
	panesDir: (root: string) => join(root, 'panes'),
	paneFile: (root: string, pane: string) => join(root, 'panes', `${sanitizePane(pane)}.id`),
	inboxDir: (root: string, id: string) => join(root, 'inbox', assertSafeId(id, 'agent id')),
	inboxReadDir: (root: string, id: string) => join(root, 'inbox', assertSafeId(id, 'agent id'), 'read'),
	dataDir: (root: string, id: string) => join(root, 'data', assertSafeId(id, 'agent id')),
	briefFile: (root: string, id: string) => join(root, 'data', assertSafeId(id, 'agent id'), 'brief.md'),
	mainPaneFile: (root: string) => join(root, 'main-pane.id'),
	/** A message's file path within `toId`'s unread/read inbox dir, keyed by its own collision-free
	 * id — validated the same as an agent id (it's the same class of risk: a peer- or CLI-controlled
	 * string becoming a filename). */
	messageFile: (root: string, toId: string, msgId: string) =>
		join(paths.inboxDir(root, toId), `${assertSafeId(msgId, 'message id')}.json`),
	messageReadFile: (root: string, toId: string, msgId: string) =>
		join(paths.inboxReadDir(root, toId), `${assertSafeId(msgId, 'message id')}.json`),
}

/**
 * Where a spawned unit's own git worktree is checked out by default — a sibling of the primary
 * checkout (`<parent>/<repo>.worktrees/legion-<id>`), never nested inside the primary's own working
 * tree. A linked worktree living inside the primary's tree is untracked-but-present: it pollutes
 * `git status` in the primary checkout, confuses tooling that walks the tree recursively (test
 * runners, watchers, `find`/`rm -rf`), and risks a tree-wide op in the primary crossing into the
 * nested worktree's own checkout. `<repo>.worktrees/` matches the sibling convention already in use
 * for other tools' worktrees in this environment (herdr's `worktree-<word>-<word>-<hash>`, cursor's
 * `<proj><count>`); the `legion-` prefix self-identifies this tool's own units the same way, without
 * needing a subfolder.
 */
export function resolveUnitWorktreePath(primaryRoot: string, id: string): string {
	return join(dirname(primaryRoot), `${basename(primaryRoot)}.worktrees`, `legion-${id}`)
}

/** tmux pane ids look like "%3"; make them filesystem-safe. */
export function sanitizePane(pane: string): string {
	return pane.replace(/[^A-Za-z0-9_-]/g, '_')
}
