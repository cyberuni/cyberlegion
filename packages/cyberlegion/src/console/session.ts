import type { Exec } from '../identity.ts'
import type { Worktree } from './worktree.ts'

/** Generic multiplexer seam — no legion-specific concepts, so this composes with any host. */

/** Where a new pane/window/session should be placed relative to the caller's current one.
 * `'workspace'` opens a genuinely separate workspace/session (herdr: `workspace create`; tmux: a
 * new detached session) — the caller's current workspace/session is left untouched, unlike every
 * other placement, which adds a pane/window inside it. */
export type SessionPlacement = 'pane:right' | 'pane:down' | 'tab' | 'workspace'

interface SessionOpenOptions {
	/** Working directory the new pane/window/session should start in. */
	cwd: string
	/** Command line to launch inside the new pane once it is open. */
	launch: string
	/** Placement relative to the caller; defaults to 'tab'. */
	at?: SessionPlacement
}

/** Opaque handle to an open pane/window/session; backend-specific id lives in `id`. */
export interface SessionTarget {
	id: string
}

/** A pane the backend can currently see, as reported by `listPanes` (bulk enumeration). */
export interface LivePane {
	/** Backend-native pane id. */
	id: string
	/** Which multiplexer this pane belongs to. */
	mux: 'tmux' | 'herdr'
	/** The harness running in this pane, when the backend can report it (herdr only). */
	harness?: string
	/** The pane's working directory, when the backend reports it. */
	cwd?: string
}

export interface SessionReadOptions {
	/** How many trailing lines of output to capture; omit for the backend's default. */
	lines?: number
}

export interface OpenInNewWorktreeOptions {
	/** The primary checkout's root — the repo the new worktree branches from. */
	primaryRoot: string
	/** Branch to create the worktree on. */
	branch: string
	/** Where the new worktree should be checked out. */
	path: string
	/** Command line to launch inside the new session once it is open. */
	launch: string
}

export interface SessionAdapter {
	/** Backend name, e.g. "tmux" or "herdr". */
	readonly name: string
	/** Create a new pane/window running `opts.launch` in `opts.cwd`; returns its target handle. */
	open(exec: Exec, opts: SessionOpenOptions): SessionTarget
	/**
	 * Atomically create a new worktree AND open it in a genuinely new workspace/session, when the
	 * backend has a native primitive for that combination (herdr's `worktree create` both creates
	 * the worktree and nests it under its source workspace in one call — a real organizational
	 * improvement over a separate worktree-add followed by a plain `open()`). Backends without such
	 * a primitive (tmux has none) omit this; callers fall back to creating the worktree themselves
	 * and then calling `open()` with `at: 'workspace'`.
	 */
	openInNewWorktree?(exec: Exec, opts: OpenInNewWorktreeOptions): { target: SessionTarget; worktree: Worktree }
	/** Type text into the target session (submitted, not queued). */
	send(exec: Exec, target: SessionTarget, text: string): void
	/** Capture the target session's current output. */
	read(exec: Exec, target: SessionTarget, opts?: SessionReadOptions): string
	/** Move input focus to the target session; best-effort (may no-op if the backend can't). */
	focus(exec: Exec, target: SessionTarget): void
	/** Close the target session. */
	teardown(exec: Exec, target: SessionTarget): void
	/**
	 * Whether the target pane still exists in this backend — the liveness check `prune` runs against a
	 * record's pane locator. Each backend answers with its own primitive so a herdr pane id is never
	 * probed with a tmux query (or vice versa).
	 */
	paneExists(exec: Exec, target: SessionTarget): boolean
	/**
	 * Enumerate every live pane this backend can currently see — the bulk counterpart to
	 * `paneExists`'s single targeted query. `reconcile` uses this to cull dead records in one pass
	 * against the mux the caller is actually inside; it never enumerates the other mux.
	 */
	listPanes(exec: Exec): LivePane[]
}
