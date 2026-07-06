import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { resolvePrimaryRoot } from './console/worktree.ts'

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
 * Resolve the primary checkout's project-local cyberlegion dir — where spawned unit worktrees
 * live (never the global hub), keyed off `git worktree`'s common-dir so it resolves the same from
 * the primary checkout or from any of its linked worktrees.
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

export const paths = {
	agentsDir: (root: string) => join(root, 'agents'),
	agentFile: (root: string, id: string) => join(root, 'agents', `${id}.json`),
	panesDir: (root: string) => join(root, 'panes'),
	paneFile: (root: string, pane: string) => join(root, 'panes', `${sanitizePane(pane)}.id`),
	inboxDir: (root: string, id: string) => join(root, 'inbox', id),
	inboxReadDir: (root: string, id: string) => join(root, 'inbox', id, 'read'),
	dataDir: (root: string, id: string) => join(root, 'data', id),
	briefFile: (root: string, id: string) => join(root, 'data', id, 'brief.md'),
	resultFile: (root: string, id: string) => join(root, 'data', id, 'result.json'),
	worktreeDir: (root: string, id: string) => join(root, 'worktrees', id),
}

/** tmux pane ids look like "%3"; make them filesystem-safe. */
export function sanitizePane(pane: string): string {
	return pane.replace(/[^A-Za-z0-9_-]/g, '_')
}
