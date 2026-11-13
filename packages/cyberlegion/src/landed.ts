import { existsSync } from 'node:fs'
import { primaryRoot as libraryPrimaryRoot, listWorktrees, normalizeWorktreePath } from 'cyber-agentkit/worktrees'
import { type IdContext, listAgents, realExec } from './identity.ts'
import { asyncExec, LEASE_IGNORE } from './worktree-lease.ts'

/**
 * Which worktrees a unit shares hold work that has landed, as the `landed` judgment `prune` takes.
 * It is the worktree library's own judgment, the one its `acquire` recycles a worktree by: the
 * checkout is clean and its branch has landed on the default branch. Asked once per repository
 * before prune's synchronous pass, for every shared worktree still on disk. A worktree git cannot
 * judge (detached, no default branch, a repository git does not know) does not count as landed, so
 * prune keeps the record that points at it.
 */
export async function landedWorktrees(ctx: Pick<IdContext, 'store' | 'exec'>): Promise<(root: string) => boolean> {
	const exec = asyncExec(ctx.exec ?? realExec)
	const roots = new Map<string, string | undefined>()
	for (const rec of listAgents(ctx.store)) {
		const shared = rec.sharedWorktree
		if (shared?.root && existsSync(shared.root)) roots.set(shared.root, shared.primaryRoot)
	}
	const landed = new Set<string>()
	const asked = new Set<string>()
	for (const [root, recorded] of roots) {
		const primary = await libraryPrimaryRoot({ from: root, exec }).catch(() => recorded)
		if (!primary || asked.has(primary)) continue
		asked.add(primary)
		const entries = await listWorktrees({ primaryRoot: primary, exec, ignore: LEASE_IGNORE }).catch(() => [])
		for (const e of entries) if (e.linked && e.merged === true && e.dirty === false) landed.add(e.root)
	}
	const normalized = new Map<string, boolean>()
	for (const root of roots.keys()) normalized.set(root, landed.has(await normalizeWorktreePath(root)))
	return (root) => normalized.get(root) ?? false
}
