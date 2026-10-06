import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { decommission } from './decommission.ts'
import type { Exec, IdContext } from './identity.ts'
import { spawn } from './session.ts'
import { FileStore } from './store/file-store.ts'

// Real git and the real worktree library: the lease lives in git's own `locked` file, and recycling a
// released worktree is the library's, so a faked git could pass every assertion here while proving
// nothing. Only the session backend is faked.

const tmuxVerb = (args: readonly string[]) => (args[0] === '-u' ? args[1] : args[0])

let tmp: string
let repo: string
let store: FileStore
let ctx: IdContext

/** git runs for real from the repository; tmux is answered as a backend that opens and kills panes. */
function execIn(cwd: string): Exec {
	return (cmd, args) => {
		if (cmd === 'git') {
			try {
				return execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
			} catch {
				return null
			}
		}
		const verb = tmuxVerb(args)
		if (verb === 'split-window' || verb === 'new-window') return '%9\t@1'
		if (verb === 'kill-pane') return ''
		return null
	}
}

beforeEach(() => {
	tmp = realpathSync(mkdtempSync(join(tmpdir(), 'cl-lease-')))
	repo = join(tmp, 'repo')
	mkdirSync(repo)
	const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, stdio: 'ignore' })
	git('init', '-q', '-b', 'main')
	writeFileSync(join(repo, 'file.txt'), 'one\n')
	git('add', 'file.txt')
	git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'init')
	store = new FileStore(join(tmp, 'hub'))
	ctx = { store, env: { TMUX: 't' }, exec: execIn(repo), now: () => 1 }
})

/** The lock reason git records for the worktree at `path`, or `undefined` when it is not locked. */
function lockOf(path: string): string | undefined {
	const list = execFileSync('git', ['worktree', 'list', '--porcelain'], { cwd: repo, encoding: 'utf8' })
	const block = list.split('\n\n').find((b) => b.split('\n')[0] === `worktree ${path}`)
	const line = block?.split('\n').find((l) => l.startsWith('locked'))
	return line === undefined ? undefined : line.slice('locked'.length).trim()
}

const unitSpawn = () => spawn(ctx, { harness: 'claude', task: 't', at: 'tab' })

describe('spec:cyberlegion/unit/lifecycle — a worktree spawn leases its worktree from the library', () => {
	it('creates the first slot beside the primary checkout, locked under a lease naming the unit', async () => {
		const res = await unitSpawn()
		const slot = join(tmp, 'repo.worktrees', 'repo-1')
		expect(res.agent.worktree?.root).toBe(slot)
		expect(res.reused).toBe(false)
		expect(lockOf(slot)).toContain(`cyberlegion:${res.agent.id}`)
		expect(lockOf(slot)).toContain(res.agent.worktree?.lease?.leaseId as string)
	})

	it('close releases the lease and leaves the worktree on disk', async () => {
		const res = await unitSpawn()
		const slot = res.agent.worktree?.root as string
		const closed = await decommission(ctx, { id: res.agent.id })
		expect(closed.lease).toEqual({ released: true })
		expect(closed.retainedWorktree).toBe(slot)
		expect(existsSync(slot)).toBe(true)
		expect(lockOf(slot)).toBeUndefined()
		expect(store.getAgent(res.agent.id)).toBeUndefined()
	})

	it('the next spawn recycles the released worktree onto its own branch', async () => {
		const first = await unitSpawn()
		await decommission(ctx, { id: first.agent.id })
		const second = await unitSpawn()
		expect(second.reused).toBe(true)
		expect(second.agent.worktree?.root).toBe(first.agent.worktree?.root)
		const branch = execFileSync('git', ['branch', '--show-current'], {
			cwd: second.agent.worktree?.root,
			encoding: 'utf8',
		}).trim()
		expect(branch).toBe(`cyberlegion/unit-${second.agent.id}`)
		// The recycle's clean took the marker with it; spawn stamps it again.
		expect(existsSync(join(second.agent.worktree?.root as string, '.agents', 'cyberlegion', 'config.json'))).toBe(true)
	})

	it('a worktree still leased by a live unit is never handed to another', async () => {
		const first = await unitSpawn()
		const second = await unitSpawn()
		expect(second.agent.worktree?.root).not.toBe(first.agent.worktree?.root)
		expect(second.agent.worktree?.root).toBe(join(tmp, 'repo.worktrees', 'repo-2'))
	})

	it('close of a leased unit with uncommitted work does not refuse, and the work is kept from reuse', async () => {
		const first = await unitSpawn()
		const slot = first.agent.worktree?.root as string
		writeFileSync(join(slot, 'wip.txt'), 'unsaved\n')
		await decommission(ctx, { id: first.agent.id })
		expect(existsSync(join(slot, 'wip.txt'))).toBe(true)
		const second = await unitSpawn()
		expect(second.agent.worktree?.root).not.toBe(slot)
		expect(existsSync(join(slot, 'wip.txt'))).toBe(true)
	})

	it('close of a unit whose lease was taken away reports it lost and still reaps', async () => {
		const res = await unitSpawn()
		const slot = res.agent.worktree?.root as string
		execFileSync('git', ['worktree', 'unlock', slot], { cwd: repo, stdio: 'ignore' })
		const closed = await decommission(ctx, { id: res.agent.id })
		expect(closed.lease).toEqual({ released: false, reason: 'lost' })
		expect(existsSync(slot)).toBe(true)
		expect(store.getAgent(res.agent.id)).toBeUndefined()
	})

	it('a --worktree-path spawn holds no lease, and close removes its worktree', async () => {
		const path = join(tmp, 'chosen')
		const res = await spawn(ctx, { harness: 'claude', task: 't', at: 'tab', worktreePath: path })
		expect(res.agent.worktree?.lease).toBeUndefined()
		expect(lockOf(path)).toBeUndefined()
		const closed = await decommission(ctx, { id: res.agent.id })
		expect(closed.lease).toBeUndefined()
		expect(existsSync(path)).toBe(false)
	})
})
