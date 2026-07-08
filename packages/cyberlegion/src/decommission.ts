import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { selectSessionAdapter } from './console/index.ts'
import { gitWorktreeAdapter, resolvePrimaryRoot } from './console/worktree.ts'
import { type AgentRecord, type Exec, type IdContext, loadAgent, realExec } from './identity.ts'

export interface DecommissionInput {
	id: string
	/** Discard uncommitted changes in the worktree. Never overrides refusing the primary checkout. */
	force?: boolean
}

export interface DecommissionResult {
	agent: AgentRecord
	worktreeRoot?: string
	pane?: string
}

/**
 * Tear a unit down and reap its registry record — the deterministic inverse of `spawn`. Refuses
 * the primary checkout (absolute — `--force` never overrides it) and a dirty worktree unless
 * `--force`. Teardown always precedes reap: an already-gone worktree or pane is tolerated, but a
 * genuine worktree-removal failure aborts and leaves the record intact so the operation is
 * retryable.
 */
export function decommission(ctx: IdContext, input: DecommissionInput): DecommissionResult {
	const rec = loadAgent(ctx.store, input.id)
	if (!rec) throw new Error(`no unit registered as agents/${input.id}.json — nothing to decommission`)

	const exec = ctx.exec ?? realExec
	const env = ctx.env ?? process.env
	const worktreeRoot = rec.worktree?.root
	// Resolve the primary checkout once — reused by the primary-checkout guard and the worktree removal.
	const primaryRoot = worktreeRoot ? resolvePrimaryRoot(exec) : undefined

	if (worktreeRoot && resolve(worktreeRoot) === resolve(primaryRoot as string)) {
		throw new Error(
			`refusing to decommission "${input.id}" — its worktree is the primary checkout; ` +
				'--force does not override this',
		)
	}

	// A worktree already gone from disk has nothing to check or remove — tolerated regardless of
	// --force. Only a worktree that still exists is subject to the dirty check and real removal.
	const worktreeExists = worktreeRoot != null && existsSync(worktreeRoot)

	if (worktreeExists && !input.force && isDirty(exec, worktreeRoot as string)) {
		throw new Error(`unit "${input.id}" has uncommitted changes in its worktree — pass --force to discard them`)
	}

	const pane = rec.pane?.id ?? ctx.store.findPaneByAgentId(input.id)

	if (worktreeExists) {
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

	return { agent: rec, worktreeRoot, pane }
}

function isDirty(exec: Exec, worktreeRoot: string): boolean {
	return !!exec('git', ['-C', worktreeRoot, 'status', '--porcelain'])
}
