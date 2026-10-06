import {
	type AcquireOptions,
	type AcquireResult,
	type Exec as AsyncExec,
	acquire,
	type Lease,
	type ReleaseResult,
	release,
} from '@cyberuni/agent-harness/worktrees'
import type { Exec } from './identity.ts'
import { WORKTREE_MARKER } from './paths.ts'

/**
 * The two worktree-library calls a unit's lifetime makes: `unit spawn` acquires a worktree, `unit
 * close` releases it. Gathered here so a test can stand in for them and drive spawn's routing without
 * a real repository behind its faked git.
 */
export const libraryLeases: {
	acquire(options: AcquireOptions): Promise<AcquireResult>
	release(lease: Lease, options: { exec?: AsyncExec }): Promise<ReleaseResult>
} = { acquire, release }

/** cyberlegion's synchronous `Exec` as the library's asynchronous one, so every git call the library
 * makes goes through the same seam spawn's own calls do. */
export function asyncExec(exec: Exec): AsyncExec {
	return async (cmd, args) => exec(cmd, [...args])
}

/** The lease holder recorded in a unit's worktree lock: names the tool and the unit, so a person
 * reading `git worktree list` can tell which unit holds it. */
export function leaseHolder(id: string): string {
	return `cyberlegion:${id}`
}

/** Paths whose changes do not make a released worktree dirty: the marker spawn stamps is
 * cyberlegion's own file, not the unit's work, and counting it would keep every slot from reuse in a
 * project that does not track it. */
export const LEASE_IGNORE: readonly string[] = [WORKTREE_MARKER]
