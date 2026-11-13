import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { landedWorktrees } from './landed.ts'
import { FileStore } from './store/file-store.ts'
import type { AgentRecord } from './store/store.ts'

let base: string
let store: FileStore
let primary: string
beforeEach(() => {
	base = mkdtempSync(join(tmpdir(), 'cl-landed-'))
	store = new FileStore(join(base, 'hub'))
	primary = join(base, 'app')
	mkdirSync(primary)
	git(primary, 'init', '-q', '-b', 'main')
	commit(primary, 'init')
})

function git(cwd: string, ...args: string[]): void {
	execFileSync('git', args, { cwd, stdio: 'ignore' })
}

function commit(cwd: string, message: string): void {
	git(cwd, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', message)
}

/** A linked worktree of the repository on its own branch, cut from main's tip. */
function worktree(name: string): string {
	const root = join(base, name)
	git(primary, 'worktree', 'add', '-q', '-b', name, root)
	return root
}

/** An exited record that shares the worktree at `root`. */
function sharer(id: string, root: string): void {
	const rec: AgentRecord = {
		id,
		handle: id,
		harness: 'claude',
		cwd: root,
		pane: null,
		status: 'exited',
		createdAt: '2026-01-01T00:00:00.000Z',
		lastSeen: '2026-01-01T00:00:00.000Z',
		worktree: null,
		sharedWorktree: { root, branch: id, primaryRoot: primary },
	}
	store.putAgent(rec)
}

describe('spec:cyberlegion/unit/registry — landed worktrees for prune', () => {
	it('a clean worktree whose branch has landed on the default branch counts as landed', async () => {
		const root = worktree('done')
		sharer('s1', root)
		const landed = await landedWorktrees({ store })
		expect(landed(root)).toBe(true)
	})

	it('a worktree whose branch carries a commit the default branch lacks does not count as landed', async () => {
		const root = worktree('ahead')
		commit(root, 'unlanded work')
		sharer('s1', root)
		const landed = await landedWorktrees({ store })
		expect(landed(root)).toBe(false)
	})

	it('a worktree with uncommitted changes does not count as landed', async () => {
		const root = worktree('dirty')
		writeFileSync(join(root, 'wip.txt'), 'work in progress')
		sharer('s1', root)
		const landed = await landedWorktrees({ store })
		expect(landed(root)).toBe(false)
	})

	it('a worktree no record names does not count as landed', async () => {
		const root = worktree('unnamed')
		const landed = await landedWorktrees({ store })
		expect(landed(root)).toBe(false)
	})
})
