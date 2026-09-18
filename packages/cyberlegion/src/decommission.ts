import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { gitWorktreeAdapter, resolvePrimaryRoot } from 'cyber-mux/worktree'
import { type AgentRecord, type Exec, type IdContext, loadAgent, realExec } from './identity.ts'
import { selectSessionAdapter } from './mux-select.ts'

export interface DecommissionInput {
	id: string
	/** Discard uncommitted changes in the worktree. Never overrides refusing the primary checkout. */
	force?: boolean
	/**
	 * Reap the unit but leave its worktree on disk, so a pool can detach it and hand it to the next
	 * unit — far cheaper than a fresh checkout per unit. Never overrides refusing the primary
	 * checkout: that guard is about identity, not destructiveness.
	 */
	keepWorktree?: boolean
}

export interface DecommissionResult {
	agent: AgentRecord
	worktreeRoot?: string
	/**
	 * The worktree left on disk by `keepWorktree` — set only when a worktree was actually there to
	 * keep, so a pool manager can treat its presence as "this path is reusable" rather than
	 * re-checking `worktreeRoot` against disk.
	 */
	retainedWorktree?: string
	pane?: string
}

/**
 * Tear a unit down and reap its registry record — the deterministic inverse of `spawn`. Refuses
 * the primary checkout (absolute — neither `--force` nor `--keep-worktree` overrides it) and a
 * dirty worktree unless `--force`. Teardown always precedes reap: an already-gone worktree or pane
 * is tolerated, but a genuine worktree-removal failure aborts and leaves the record intact so the
 * operation is retryable.
 *
 * `keepWorktree` reaps everything else — pane, record, pane pointer, brief — and leaves the
 * checkout on disk, reporting it as `retainedWorktree`.
 */
export function decommission(ctx: IdContext, input: DecommissionInput): DecommissionResult {
	const rec = loadAgent(ctx.store, input.id)
	if (!rec) throw new Error(`no unit registered as agents/${input.id}.json — nothing to decommission`)
	// A service endpoint is the durable address of a project service, not a runtime: reaping it would
	// delete the service's pending mail out from under whichever unit owns it next.
	if (rec.kind === 'service') {
		throw new Error(`refusing to decommission "${input.id}" — it is a service endpoint, not a unit`)
	}

	const exec = ctx.exec ?? realExec
	const env = ctx.env ?? process.env
	const worktreeRoot = rec.worktree?.root
	// Resolve the primary checkout once — reused by the primary-checkout guard and the worktree removal.
	const primaryRoot = worktreeRoot ? resolvePrimaryRoot(exec) : undefined

	if (worktreeRoot && resolve(worktreeRoot) === resolve(primaryRoot as string)) {
		throw new Error(
			`refusing to decommission "${input.id}" — its worktree is the primary checkout; ` +
				'neither --force nor --keep-worktree overrides this',
		)
	}

	// A worktree already gone from disk has nothing to check or remove — tolerated regardless of
	// --force. Only a worktree that still exists is subject to the dirty check and real removal.
	const worktreeExists = worktreeRoot != null && existsSync(worktreeRoot)
	// Under keepWorktree nothing is removed, so there is no removal to guard: the dirty check exists
	// only to stop `git worktree remove` from discarding uncommitted work. Keeping it here would
	// refuse a close that destroys nothing, and push the operator toward `--force` — the strictly
	// more destructive flag — to get the strictly less destructive outcome. So it is relaxed.
	const removesWorktree = worktreeExists && !input.keepWorktree

	if (removesWorktree && !input.force && isDirty(exec, worktreeRoot as string)) {
		throw new Error(`unit "${input.id}" has uncommitted changes in its worktree — pass --force to discard them`)
	}

	const pane = rec.pane?.id ?? ctx.store.findPaneByAgentId(input.id)

	if (removesWorktree) {
		try {
			gitWorktreeAdapter.remove(exec, worktreeRoot as string, { primaryRoot: primaryRoot as string })
		} catch (err) {
			// A genuine teardown failure aborts BEFORE any reap — the record is left intact so the
			// decommission can be retried, never half-reaped.
			throw new Error(
				`decommission "${input.id}" aborted — worktree removal failed, record left intact for retry: ` +
					`${err instanceof Error ? err.message : String(err)}`,
			)
		}
	}

	if (pane) {
		try {
			selectSessionAdapter(env, exec).teardown(exec, { id: pane })
		} catch {
			// Already gone, or no session backend available — tolerated; reap proceeds regardless.
		}
	}

	// Reap only this id's state, after teardown succeeded or was already done.
	ctx.store.removeAgent(input.id)
	if (pane) ctx.store.removePaneIndex(pane)
	ctx.store.removeAgentData(input.id)

	return {
		agent: rec,
		worktreeRoot,
		retainedWorktree: worktreeExists && input.keepWorktree ? (worktreeRoot as string) : undefined,
		pane,
	}
}

function isDirty(exec: Exec, worktreeRoot: string): boolean {
	return !!exec('git', ['-C', worktreeRoot, 'status', '--porcelain'])
}
