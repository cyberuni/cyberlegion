// A shared, three-state process-liveness probe — extracted out of lock.ts so every future call site
// is forced to state its own policy at the point of use rather than inherit lock.ts's.
//
// The single most-repeated root cause across both comparable projects surveyed for this hardening
// pass (agmsg, firstmate — see .research/messaging-robustness/evidence.md) was collapsing an
// ambiguous liveness signal into a BOOLEAN, then reusing that boolean at a call site whose safe
// default was the OPPOSITE of the one it was written for: a locking path that must fail closed
// (never steal on ambiguity) and a reaping/pruning path that must fail open (never resurrect-then-
// silently-drop a live agent's record on ambiguity) cannot share one `isAlive: boolean`, because
// there is no single boolean value that is safe for both. Three states make the ambiguous case
// impossible to default silently — a caller has to write down what 'unknown' means HERE.

export type ProcessLiveness = 'alive' | 'dead' | 'unknown'

/**
 * Probe whether `pid` is alive using `process.kill(pid, 0)` — the POSIX "does this process exist"
 * idiom; it sends no signal, it only tests deliverability. `ESRCH` (no such process) is the only
 * errno that means "definitely dead". Every other errno — `EPERM` above all, common under sandboxes
 * and containers where a genuinely live process can be unsignalable by this one, or any process
 * owned by a different uid — reads as `'unknown'`, never `'dead'`: collapsing `EPERM` into "dead" is
 * exactly the defect this three-state return exists to make structurally impossible to reintroduce
 * at a new call site. Same-pid is trivially `'alive'` (a process checking its own prior identity,
 * e.g. after a crash-and-restart that reused nothing).
 */
export function probeProcess(pid: number): ProcessLiveness {
	if (pid === process.pid) return 'alive'
	try {
		process.kill(pid, 0)
		return 'alive'
	} catch (err) {
		return (err as NodeJS.ErrnoException).code === 'ESRCH' ? 'dead' : 'unknown'
	}
}
