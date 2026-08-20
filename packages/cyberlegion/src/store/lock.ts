import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { probeProcess } from './process-liveness.ts'

// An advisory lock for the one class of store operation `writeFileAtomic` alone can't make safe:
// a genuine read-modify-write, where a torn WRITE isn't the risk (finding 1 already fixes that) —
// two writers interleaving their READ-then-decide-then-WRITE is. `setMainPane` uses this to
// serialize concurrent rebinds of the hub's single owner-presence pointer; `identity.ts`'s
// `claimPresence`/`clearPresence` (load a standing record, mutate `.presence`, save it back — the
// other genuine RMW evidence.md names) now wraps its own load-mutate-save in the same primitive,
// under a lock named per standing record so two different owners' claims never contend on the same
// name.

export interface LockHandle {
	release(): void
}

export interface LockOptions {
	/** Give up and throw LockTimeoutError after this long spent waiting on a live holder. Default 5s. */
	timeoutMs?: number
	/** Delay between contention retries. Default 20ms. */
	retryDelayMs?: number
}

export class LockTimeoutError extends Error {
	constructor(public readonly name: string) {
		super(`timed out waiting for lock "${name}"`)
		this.name = 'LockTimeoutError'
	}
}

interface Holder {
	pid: number
	acquiredAt: number
}

function locksDir(root: string): string {
	return join(root, 'locks')
}

function lockDirFor(root: string, name: string): string {
	return join(locksDir(root), `${name}.lock`)
}

/** Read a lock dir's recorded holder. Absent/corrupt/mid-acquire (holder.json not written yet) all
 * read as "unknown" — never grounds to steal. An ambiguous read must never look like a green light. */
function readHolder(dir: string): Holder | undefined {
	try {
		return JSON.parse(readFileSync(join(dir, 'holder.json'), 'utf8')) as Holder
	} catch {
		return undefined
	}
}

/** Locking's policy on `probeProcess`'s `'unknown'` state: treat it exactly like `'alive'` — i.e.
 * NOT `'dead'`. The one invariant that must never break here is stealing a lock a live holder still
 * holds, and `'unknown'` means "cannot rule out alive", so it can only ever be safe to fold it into
 * the "do not steal" side. This is a local policy decision, not `probeProcess`'s — a different call
 * site (a staleness reaper, say) folding `'unknown'` into "not provably alive" instead would be
 * reading the SAME three states toward the opposite default, which is exactly the bug class this
 * three-state type exists to force each call site to decide explicitly (see process-liveness.ts). */
function heldByLiveOrUnknownPid(pid: number): boolean {
	return probeProcess(pid) !== 'dead'
}

function sleepSync(ms: number): void {
	if (ms <= 0) return
	Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

/**
 * Attempt to reclaim an abandoned lock dir without ever discarding a LIVE one out from under its
 * holder — the exact defect agmsg/firstmate's lock suites exist to catch (evidence.md items 3-4).
 *
 * `mkdirSync` on the lock path itself already arbitrates ordinary contention (EEXIST = someone else
 * got there first); the harder race is a STEAL: two processes independently deciding the same lock
 * looks dead. `renameSync` gives the same exclusivity `mkdirSync` gives for a fresh path, but for an
 * EXISTING one — of any number of processes racing to rename the SAME source path away, exactly one
 * succeeds and the rest get ENOENT. So the rename-away is the sole arbiter of "who gets to attempt
 * the steal", not the earlier staleness read.
 *
 * That still leaves one race: the content we read as stale might not be the content we actually
 * capture, if the true holder released and a NEW, live holder re-acquired at this same path between
 * our staleness read and our rename. So after winning the rename, re-check the pid we ACTUALLY
 * captured (not the one from the earlier read) — if it's alive, this was a live lock we grabbed by
 * accident; put it back immediately (best-effort — if a third party has since re-mkdir'd the path,
 * the invariant we're protecting already holds, so just drop our capture) and refuse to finalize.
 */
function tryReclaimStale(dir: string): boolean {
	const grave = `${dir}.stale-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`
	try {
		renameSync(dir, grave)
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === 'ENOENT') return false // lost the reclaim race
		throw err
	}
	const captured = readHolder(grave)
	if (captured && heldByLiveOrUnknownPid(captured.pid)) {
		try {
			renameSync(grave, dir) // restore — never finalize a steal against a live holder
		} catch {
			rmSync(grave, { recursive: true, force: true }) // someone else already re-holds `dir`; drop our capture
		}
		return false
	}
	rmSync(grave, { recursive: true, force: true })
	return true
}

/**
 * Acquire an advisory, mkdir-based lock at `root/locks/<name>.lock`. mkdir (not O_EXCL on a file) is
 * the primitive here because a lock also needs to carry its holder metadata (pid + timestamp) for
 * staleness detection, and a directory gives that a natural home (`holder.json` inside it) without a
 * second file to keep in sync; `mkdirSync` on a non-existent path is exactly as atomic as an
 * exclusive file create on every filesystem this tool targets (POSIX; NTFS via Node's Win32 mkdir).
 *
 * Blocks (busy-retries) until acquired or `timeoutMs` elapses, reclaiming a dead holder's lock along
 * the way (see `tryReclaimStale`) but NEVER a live one — contention with a live holder always waits
 * it out or times out, never steals.
 */
export function acquireLock(root: string, name: string, opts: LockOptions = {}): LockHandle {
	const retryDelayMs = opts.retryDelayMs ?? 20
	const timeoutMs = opts.timeoutMs ?? 5000
	const dir = lockDirFor(root, name)
	mkdirSync(locksDir(root), { recursive: true })
	const deadline = Date.now() + timeoutMs
	for (;;) {
		try {
			mkdirSync(dir)
			writeFileSync(
				join(dir, 'holder.json'),
				JSON.stringify({ pid: process.pid, acquiredAt: Date.now() } satisfies Holder),
			)
			return { release: () => rmSync(dir, { recursive: true, force: true }) }
		} catch (err) {
			if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err
			const holder = readHolder(dir)
			if (holder && !heldByLiveOrUnknownPid(holder.pid) && tryReclaimStale(dir)) continue // dead holder recovered — retry the mkdir above on a clear path
			if (Date.now() > deadline) throw new LockTimeoutError(name)
			sleepSync(retryDelayMs)
		}
	}
}

/** Acquire `name`, run `fn`, and always release — the shape every genuine read-modify-write in the
 * store should use (`setMainPane`, `identity.ts`'s `claimPresence`/`clearPresence` today). */
export function withLock<T>(root: string, name: string, fn: () => T, opts?: LockOptions): T {
	const handle = acquireLock(root, name, opts)
	try {
		return fn()
	} finally {
		handle.release()
	}
}
