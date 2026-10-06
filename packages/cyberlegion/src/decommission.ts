import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { primaryRoot as libraryPrimaryRoot, type ReleaseResult } from '@cyberuni/agent-harness/worktrees'
import { gitWorktreeAdapter } from 'cyber-mux/worktree'
import { type AgentRecord, type Exec, type IdContext, loadAgent, realExec } from './identity.ts'
import { deleteMailbox } from './message.ts'
import { selectSessionAdapter } from './mux-select.ts'
import { WORKTREE_MARKER } from './paths.ts'
import { asyncExec, libraryLeases } from './worktree-lease.ts'

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
	 * The worktree left on disk by `keepWorktree` or by releasing a lease — set only when a worktree was actually there to
	 * keep, so a pool manager can treat its presence as "this path is reusable" rather than
	 * re-checking `worktreeRoot` against disk.
	 */
	retainedWorktree?: string
	/** How the unit's worktree lease was given back — present only for a unit that held one. A
	 * `lost` lease (someone unlocked the worktree or locked over it) is reported, never thrown. */
	lease?: ReleaseResult
	pane?: string
}

/**
 * Tear a unit down and reap its registry record — the deterministic inverse of `spawn`. Refuses
 * the primary checkout (absolute — neither `--force` nor `--keep-worktree` overrides it) and a
 * dirty worktree unless `--force`. Teardown always precedes reap: an already-gone worktree or pane
 * is tolerated, but a genuine worktree-removal failure aborts and leaves the record intact so the
 * operation is retryable.
 *
 * The reap covers the record, pane pointer, stored brief, and mailbox. To end only the session and keep
 * the unit, `stopUnit` (`unit-runtime.ts`) is the non-destructive counterpart.
 *
 * `keepWorktree` reaps everything else — pane, record, pane pointer, brief, mailbox — and leaves the
 * checkout on disk, reporting it as `retainedWorktree`.
 *
 * A unit whose worktree spawn acquired from the worktree library holds a lease on it, and close
 * releases that lease instead of removing anything: the checkout stays on disk (`retainedWorktree`),
 * and the library's next `acquire` recycles it once it is idle, clean, and landed. Nothing is
 * discarded, so neither the dirty refusal nor `--force` applies — a dirty worktree is skipped by the
 * next `acquire` rather than lost. Release precedes the pane teardown, so a release that throws leaves
 * everything for a retry, as a failed removal does.
 */
export async function decommission(ctx: IdContext, input: DecommissionInput): Promise<DecommissionResult> {
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
	// A worktree already gone from disk has nothing to check or remove — tolerated regardless of
	// --force. Only a worktree that still exists is subject to the dirty check and real removal.
	const worktreeExists = worktreeRoot != null && existsSync(worktreeRoot)
	// The primary checkout of the UNIT's repository, never the caller's: close is run from wherever
	// the caller's session sits, usually another repository, and git asked there to remove this
	// worktree refuses. A worktree on disk names its own repository; one already gone is found only
	// through the root spawn recorded. Reused by the primary-checkout guard and the removal.
	const primaryRoot = worktreeExists ? await primaryRootOf(exec, worktreeRoot as string) : rec.worktree?.primaryRoot
	const held = rec.worktree?.lease

	if (worktreeRoot && primaryRoot && resolve(worktreeRoot) === resolve(primaryRoot)) {
		throw new Error(
			`refusing to decommission "${input.id}" — its worktree is the primary checkout; ` +
				'neither --force nor --keep-worktree overrides this',
		)
	}
	// Under keepWorktree nothing is removed, so there is no removal to guard: the dirty check exists
	// only to stop `git worktree remove` from discarding uncommitted work. Keeping it here would
	// refuse a close that destroys nothing, and push the operator toward `--force` — the strictly
	// more destructive flag — to get the strictly less destructive outcome. So it is relaxed.
	const removesWorktree = worktreeExists && !input.keepWorktree && !held

	if (removesWorktree && !input.force && isDirty(exec, worktreeRoot as string)) {
		throw new Error(`unit "${input.id}" has uncommitted changes in its worktree — pass --force to discard them`)
	}

	const pane = rec.pane?.id ?? ctx.store.findPaneByAgentId(input.id)

	// A worktree whose directory is gone may still be registered with git — a removal interrupted
	// after the directory went. Clear that registration where it lives so the branch is not held by a
	// checkout that no longer exists. Best-effort: there is nothing on disk left to lose.
	if (worktreeRoot && !worktreeExists && primaryRoot && existsSync(primaryRoot)) {
		exec('git', ['-C', primaryRoot, 'worktree', 'prune'])
	}

	let lease: ReleaseResult | undefined
	if (held && worktreeRoot) {
		lease = await libraryLeases.release({ worktree: worktreeRoot, ...held }, { exec: asyncExec(exec) })
	}

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
	// The mailbox goes with the unit — a close is the address going away for good. Asked of the mail
	// side rather than deleted here, so where a mailbox lives stays mail's concern.
	deleteMailbox(ctx.store, input.id)

	return {
		agent: rec,
		worktreeRoot,
		retainedWorktree: worktreeExists && (input.keepWorktree || held) ? (worktreeRoot as string) : undefined,
		...(lease ? { lease } : {}),
		pane,
	}
}

/**
 * The primary checkout of the repository `worktreeRoot` belongs to — asked of the worktree itself, so
 * the answer does not depend on where the caller runs. Throws for a directory git does not know: there
 * is no repository to remove it from.
 */
async function primaryRootOf(exec: Exec, worktreeRoot: string): Promise<string> {
	try {
		return await libraryPrimaryRoot({ from: worktreeRoot, exec: asyncExec(exec) })
	} catch {
		throw new Error(`cannot resolve the repository of worktree ${worktreeRoot} — git does not know it`)
	}
}

/**
 * Whether the worktree holds work a removal would discard. The marker `spawn` stamps into every
 * worktree it creates is cyberlegion's own file, not the unit's work: in a project that does not
 * track it, it shows as untracked in every spawned worktree, and counting it would make a plain close
 * of a finished unit always demand `--force`. Only that exact untracked path is set aside — listed
 * per file, so anything else the unit left under `.agents/` still counts.
 */
function isDirty(exec: Exec, worktreeRoot: string): boolean {
	const status = exec('git', ['-C', worktreeRoot, 'status', '--porcelain', '--untracked-files=all'])
	return !!status && status.split('\n').some((line) => line && line !== `?? ${WORKTREE_MARKER}`)
}
