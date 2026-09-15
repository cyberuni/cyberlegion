import { createHash } from 'node:crypto'
import { existsSync, realpathSync, statSync } from 'node:fs'
import { basename, dirname, isAbsolute, resolve, sep } from 'node:path'
import { type Exec, realExec } from './identity.ts'
import type { ProjectRecord, Store } from './store/store.ts'

export type { ProjectRecord } from './store/store.ts'

export interface ProjectContext {
	store: Store
	exec?: Exec
	now?: () => number
}

/**
 * The canonical git common dir for `dir`, or undefined outside a repository. The common dir is the
 * one path every checkout of a repository shares — the default checkout and each linked worktree
 * all report the same `.git` — so it is what makes "same project from two worktrees" one reference.
 * Realpath'd so a symlinked path to the same repository cannot mint a second id.
 */
function commonDirOf(exec: Exec, dir: string): string | undefined {
	const out = exec('git', ['-C', dir, 'rev-parse', '--path-format=absolute', '--git-common-dir'])
	if (!out) return undefined
	return realOrResolved(out)
}

/**
 * Derive a project's stable reference from its canonical common dir. Deterministic rather than
 * minted, so two worktrees registering the same project at the same instant converge on one id with
 * no lock, and two unrelated repositories that merely share a directory name never collide.
 */
function projectIdOf(commonDir: string): string {
	return `prj-${createHash('sha256').update(commonDir).digest('hex').slice(0, 16)}`
}

function realOrResolved(path: string): string {
	try {
		return realpathSync(path)
	} catch {
		return resolve(path)
	}
}

/**
 * The default checkout's root, and whether that answer is authoritative. Asked from the default
 * checkout itself (its git dir IS the common dir), `--show-toplevel` is exact wherever the git dir
 * lives. Asked from a linked worktree, git has no pointer back to the default checkout when its git
 * dir was separated (`git init --separate-git-dir`) — even `git worktree list` then reports the git
 * dir — so the common dir's parent is only a guess.
 */
function defaultCheckoutOf(exec: Exec, dir: string, commonDir: string): { root: string; exact: boolean } {
	const gitDir = exec('git', ['-C', dir, 'rev-parse', '--path-format=absolute', '--git-dir'])
	const top = exec('git', ['-C', dir, 'rev-parse', '--show-toplevel'])
	if (gitDir && top && realOrResolved(gitDir) === commonDir) return { root: realOrResolved(top), exact: true }
	return { root: dirname(commonDir), exact: false }
}

/**
 * Register (or idempotently refresh) the project containing `dir` — any checkout of it, default or
 * linked. Keeps the first `registeredAt`, so re-registering from a worktree is a no-op in effect.
 */
export function registerProject(ctx: ProjectContext, input: { dir?: string } = {}): ProjectRecord {
	const exec = ctx.exec ?? realExec
	const dir = resolve(input.dir ?? process.cwd())
	const commonDir = commonDirOf(exec, dir)
	if (!commonDir) throw new Error(`cannot register a project at "${dir}" — not inside a git repository`)
	ctx.store.ensureMarker()
	const id = projectIdOf(commonDir)
	const existing = ctx.store.getProject(id)
	const checkout = defaultCheckoutOf(exec, dir, commonDir)
	// A guess from a linked worktree never overwrites a root already on record.
	const root = checkout.exact || !existing ? checkout.root : existing.root
	const rec: ProjectRecord = {
		id,
		name: basename(root),
		root,
		commonDir,
		registeredAt: existing?.registeredAt ?? new Date(ctx.now?.() ?? Date.now()).toISOString(),
	}
	ctx.store.putProject(rec)
	return rec
}

export function listProjects(store: Store): ProjectRecord[] {
	return store.listProjects()
}

function looksLikePath(ref: string): boolean {
	return isAbsolute(ref) || ref.startsWith('.') || ref.includes(sep) || ref.includes('/')
}

function isDirectory(path: string): boolean {
	return existsSync(path) && statSync(path).isDirectory()
}

/**
 * Resolve a project from anywhere — by id, by a path inside any of its checkouts, or by name when
 * exactly one registered project carries it. A path registers its project on first use: git has
 * already confirmed it is a repository, and registering is idempotent, so there is nothing a typo
 * could mint. A name never registers — nothing can be found by a name no checkout has reported —
 * and an ambiguous name names its candidates rather than picking one.
 */
export function resolveProject(ctx: ProjectContext, ref: string): ProjectRecord {
	const byId = ctx.store.getProject(ref)
	if (byId) return byId
	const asPath = resolve(ref)
	if (looksLikePath(ref) && isDirectory(asPath)) return byPath(ctx, asPath)
	const named = ctx.store.listProjects().filter((p) => p.name === ref)
	if (named.length === 1) return named[0] as ProjectRecord
	if (named.length > 1) {
		throw new Error(
			`project name "${ref}" is ambiguous — ${named.map((p) => `${p.id} (${p.root})`).join(', ')}; pass an id or a path`,
		)
	}
	if (isDirectory(asPath)) return byPath(ctx, asPath)
	throw new Error(
		`no registered project "${ref}" (tried id, path, and name) — pass a path inside the repository to register it`,
	)
}

function byPath(ctx: ProjectContext, dir: string): ProjectRecord {
	const commonDir = commonDirOf(ctx.exec ?? realExec, dir)
	if (!commonDir) throw new Error(`"${dir}" is not inside a git repository`)
	return ctx.store.getProject(projectIdOf(commonDir)) ?? registerProject(ctx, { dir })
}
