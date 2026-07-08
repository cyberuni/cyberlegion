import { existsSync, mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { decommission } from './decommission.ts'
import { type AgentRecord, type Exec, saveAgent } from './identity.ts'
import { FileStore } from './store/file-store.ts'

let store: FileStore
let worktreeRoot: string
const primaryRoot = '/repo'

beforeEach(() => {
	const tmp = mkdtempSync(join(tmpdir(), 'cl-'))
	store = new FileStore(join(tmp, 'hub'))
	worktreeRoot = join(tmp, 'unit-worktree')
	mkdirSync(worktreeRoot, { recursive: true })
})

/** A fake `exec` covering git worktree/status calls plus tmux/herdr session calls, with hooks. */
function makeExec(
	opts: {
		worktreeRemove?: (path: string) => string | null
		dirty?: boolean
		tmuxKillPane?: (args: string[]) => string | null
		herdrClose?: (args: string[]) => string | null
	} = {},
): { exec: Exec; calls: { worktreeRemove: string[][]; tmuxKill: string[][]; herdrClose: string[][] } } {
	const calls = { worktreeRemove: [] as string[][], tmuxKill: [] as string[][], herdrClose: [] as string[][] }
	const exec: Exec = (cmd, args) => {
		if (cmd === 'git') {
			if (args.includes('--git-common-dir')) return `${primaryRoot}/.git`
			if (args.includes('status')) return opts.dirty ? ' M file.txt' : ''
			if (args.includes('worktree') && args.includes('remove')) {
				calls.worktreeRemove.push(args)
				const path = args[args.length - 2]!
				return opts.worktreeRemove ? opts.worktreeRemove(path) : ''
			}
			return null
		}
		if (cmd === 'tmux' && args[0] === 'kill-pane') {
			calls.tmuxKill.push(args)
			return opts.tmuxKillPane ? opts.tmuxKillPane(args) : ''
		}
		if (cmd === 'herdr' && args[0] === 'pane' && args[1] === 'close') {
			calls.herdrClose.push(args)
			return opts.herdrClose ? opts.herdrClose(args) : ''
		}
		return null
	}
	return { exec, calls }
}

function registerUnit(rec: Partial<AgentRecord> & { id: string }): AgentRecord {
	const full: AgentRecord = {
		handle: rec.id.slice(0, 6),
		harness: 'claude',
		cwd: worktreeRoot,
		status: 'active',
		createdAt: '2026-01-01T00:00:00.000Z',
		lastSeen: '2026-01-01T00:00:00.000Z',
		worktree: { root: worktreeRoot, branch: `cyberlegion/unit-${rec.id}` },
		pane: { mux: 'tmux', id: '%9' },
		...rec,
	}
	saveAgent(store, full)
	return full
}

function writePaneFile(pane: string, id: string): void {
	store.putPaneIndex(pane, id)
}

function writeData(id: string): void {
	store.writeBrief(id, 'brief')
}

describe('teardown worktree + session', () => {
	it('removes the worktree through the worktree adapter and tears down the pane through the session adapter', () => {
		registerUnit({ id: 'a1' })
		const { exec, calls } = makeExec()
		decommission({ store, env: { TMUX: 't' }, exec }, { id: 'a1' })
		expect(calls.worktreeRemove[0]).toEqual(expect.arrayContaining(['-C', primaryRoot, 'worktree', 'remove']))
		expect(calls.tmuxKill[0]).toEqual(['kill-pane', '-t', '%9'])
	})

	it('tears down through the tmux adapter when $TMUX is set', () => {
		registerUnit({ id: 'a2' })
		const { exec, calls } = makeExec()
		decommission({ store, env: { TMUX: 't' }, exec }, { id: 'a2' })
		expect(calls.tmuxKill).toHaveLength(1)
		expect(calls.herdrClose).toHaveLength(0)
	})

	it('uses the herdr adapter when $TMUX is unset and $HERDR_ENV is set', () => {
		registerUnit({ id: 'a3', pane: null })
		writePaneFile('herdr-pane-1', 'a3')
		const { exec, calls } = makeExec()
		decommission({ store, env: { HERDR_ENV: '1' }, exec }, { id: 'a3' })
		expect(calls.herdrClose[0]).toEqual(['pane', 'close', 'herdr-pane-1'])
		expect(calls.tmuxKill).toHaveLength(0)
	})

	it("resolves a herdr unit's pane from the pane index when the record has none", () => {
		registerUnit({ id: 'a4', pane: null })
		writePaneFile('herdr-pane-2', 'a4')
		const { exec, calls } = makeExec()
		decommission({ store, env: { HERDR_ENV: '1' }, exec }, { id: 'a4' })
		expect(calls.herdrClose[0]).toEqual(['pane', 'close', 'herdr-pane-2'])
	})
})

describe('close on a --cwd unit removes no worktree', () => {
	it('tears down the session pane and reaps the record without touching a worktree', () => {
		registerUnit({ id: 'cwd1', worktree: null })
		writePaneFile('%9', 'cwd1')
		writeData('cwd1')
		const { exec, calls } = makeExec()
		decommission({ store, env: { TMUX: 't' }, exec }, { id: 'cwd1' })
		expect(calls.worktreeRemove).toHaveLength(0)
		expect(calls.tmuxKill[0]).toEqual(['kill-pane', '-t', '%9'])
		expect(store.getAgent('cwd1')).toBeUndefined()
		expect(store.resolvePaneId('%9')).toBeUndefined()
		expect(store.readBrief('cwd1')).toBeUndefined()
	})
})

describe('reap the record', () => {
	it('reaps the agent record, pane index, and data after teardown', () => {
		registerUnit({ id: 'b1' })
		writePaneFile('%9', 'b1')
		writeData('b1')
		const { exec } = makeExec()
		decommission({ store, env: { TMUX: 't' }, exec }, { id: 'b1' })
		expect(store.getAgent('b1')).toBeUndefined()
		expect(store.resolvePaneId('%9')).toBeUndefined()
		expect(store.readBrief('b1')).toBeUndefined()
	})

	it("reaps only the decommissioned unit's state, leaving another unit's untouched", () => {
		registerUnit({ id: 'b2', pane: { mux: 'tmux', id: '%9' } })
		writePaneFile('%9', 'b2')
		writeData('b2')
		const otherRoot = join(worktreeRoot, '..', 'other-worktree')
		mkdirSync(otherRoot, { recursive: true })
		registerUnit({
			id: 'other',
			worktree: { root: otherRoot, branch: 'cyberlegion/unit-other' },
			pane: { mux: 'tmux', id: '%8' },
		})
		writePaneFile('%8', 'other')
		writeData('other')

		const { exec } = makeExec()
		decommission({ store, env: { TMUX: 't' }, exec }, { id: 'b2' })

		expect(store.getAgent('other')).toBeDefined()
		expect(store.resolvePaneId('%8')).toBe('other')
		expect(store.readBrief('other')).toBe('brief')
	})
})

describe('refusing the primary checkout', () => {
	it('refuses a unit whose worktree root equals the primary checkout, and reaps nothing', () => {
		registerUnit({ id: 'c1', worktree: { root: primaryRoot } })
		const { exec, calls } = makeExec()
		expect(() => decommission({ store, env: { TMUX: 't' }, exec }, { id: 'c1' })).toThrow(/primary checkout/)
		expect(store.getAgent('c1')).toBeDefined()
		expect(calls.worktreeRemove).toHaveLength(0)
	})

	it('--force does not override the refusal', () => {
		registerUnit({ id: 'c2', worktree: { root: primaryRoot } })
		const { exec } = makeExec()
		expect(() => decommission({ store, env: { TMUX: 't' }, exec }, { id: 'c2', force: true })).toThrow(
			/primary checkout/,
		)
		expect(store.getAgent('c2')).toBeDefined()
	})
})

describe('dirty-worktree refusal', () => {
	it('refuses a unit with uncommitted changes, reaping nothing', () => {
		registerUnit({ id: 'd1' })
		const { exec } = makeExec({ dirty: true })
		expect(() => decommission({ store, env: { TMUX: 't' }, exec }, { id: 'd1' })).toThrow(/uncommitted/)
		expect(store.getAgent('d1')).toBeDefined()
	})

	it('with --force tears down a dirty worktree and reaps the record', () => {
		registerUnit({ id: 'd2' })
		const { exec, calls } = makeExec({ dirty: true })
		decommission({ store, env: { TMUX: 't' }, exec }, { id: 'd2', force: true })
		expect(calls.worktreeRemove).toHaveLength(1)
		expect(store.getAgent('d2')).toBeUndefined()
	})
})

describe('unknown id', () => {
	it('errors and reaps nothing when no agent is registered', () => {
		const { exec } = makeExec()
		expect(() => decommission({ store, env: { TMUX: 't' }, exec }, { id: 'ghost' })).toThrow(/no unit registered/)
		expect(existsSync(store.root)).toBe(false)
	})
})

describe('idempotent reap (already-gone is tolerated)', () => {
	it('completes the reap when the worktree no longer exists on disk', () => {
		registerUnit({ id: 'e1', worktree: { root: join(worktreeRoot, 'gone') } })
		writeData('e1')
		const { exec, calls } = makeExec()
		decommission({ store, env: { TMUX: 't' }, exec }, { id: 'e1' })
		expect(calls.worktreeRemove).toHaveLength(0) // never even attempted — nothing on disk to remove
		expect(store.getAgent('e1')).toBeUndefined()
		expect(store.readBrief('e1')).toBeUndefined()
	})

	it('completes the reap when the pane no longer exists', () => {
		registerUnit({ id: 'e2' })
		writeData('e2')
		const { exec } = makeExec({ tmuxKillPane: () => null }) // simulates the backend reporting failure
		decommission({ store, env: { TMUX: 't' }, exec }, { id: 'e2' })
		expect(store.getAgent('e2')).toBeUndefined()
		expect(store.readBrief('e2')).toBeUndefined()
	})
})

describe('teardown precedes reap — a genuine failure is not tolerated', () => {
	it('aborts without reaping when worktree removal genuinely fails', () => {
		registerUnit({ id: 'f1' })
		writeData('f1')
		const { exec } = makeExec({ worktreeRemove: () => null }) // exec reports a real failure
		expect(() => decommission({ store, env: { TMUX: 't' }, exec }, { id: 'f1' })).toThrow(/aborted|removal failed/)
		expect(store.getAgent('f1')).toBeDefined()
		expect(store.readBrief('f1')).toBe('brief')
	})
})
