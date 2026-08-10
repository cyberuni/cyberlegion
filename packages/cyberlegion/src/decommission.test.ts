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
		// ...and it removes THIS unit's worktree. `arrayContaining` ignores the path argument, so a
		// remove aimed at the parent directory — which holds every sibling unit's worktree — passes it.
		expect(calls.worktreeRemove[0]).toContain(worktreeRoot)
		expect(calls.tmuxKill[0]).toEqual(['kill-pane', '-t', '%9'])
	})

	it('completes the reap when the session pane no longer exists', () => {
		// A pane already gone makes teardown throw. The reap must still complete — otherwise a unit
		// whose pane died first can never be closed, and its record is stranded forever.
		registerUnit({ id: 'gone1' })
		const { exec: base } = makeExec()
		const exec: Exec = (cmd, args) => {
			if (cmd === 'tmux' && args[0] === 'kill-pane') throw new Error("can't find pane %9")
			return base(cmd, args)
		}
		expect(() => decommission({ store, env: { TMUX: 't' }, exec }, { id: 'gone1' })).not.toThrow()
		expect(store.getAgent('gone1')).toBeUndefined() // reaped regardless
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
		// The caller SUPPLIED this directory; close never created it, so close must never remove it.
		const suppliedDir = join(worktreeRoot, '..', 'caller-supplied')
		mkdirSync(suppliedDir, { recursive: true })
		registerUnit({ id: 'cwd1', worktree: null, cwd: suppliedDir })
		writePaneFile('%9', 'cwd1')
		writeData('cwd1')
		const { exec, calls } = makeExec()
		decommission({ store, env: { TMUX: 't' }, exec }, { id: 'cwd1' })
		expect(calls.worktreeRemove).toHaveLength(0)
		expect(existsSync(suppliedDir)).toBe(true)
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

		// The frozen Then is a conjunction — a's state is GONE and b's is unchanged. Without the
		// first half, a close that skipped the whole reap whenever a sibling was registered (the
		// most natural way to write "leave the other unit alone") satisfies every clause below.
		expect(store.getAgent('b2')).toBeUndefined()
		expect(store.resolvePaneId('%9')).toBeUndefined()
		expect(store.readBrief('b2')).toBeUndefined()

		expect(store.getAgent('other')).toBeDefined()
		expect(store.resolvePaneId('%8')).toBe('other')
		expect(store.readBrief('other')).toBe('brief')
	})
})

describe('a unit no pane can be resolved for', () => {
	it('reaps it, tearing nothing down and touching no other unit pane pointer', () => {
		// No pane on the record and no index entry of its own. The index is NOT empty — it holds
		// another unit's live pane — so a reverse lookup that matched the first entry it found, or a
		// reap that cleared the whole index, is visible here rather than passing against an empty dir.
		registerUnit({ id: 'nopane1', pane: null })
		writeData('nopane1')
		registerUnit({ id: 'neighbor', pane: { mux: 'tmux', id: '%8' } })
		writePaneFile('%8', 'neighbor')

		const { exec, calls } = makeExec()
		const res = decommission({ store, env: { TMUX: 't' }, exec }, { id: 'nopane1' })

		expect(calls.tmuxKill).toHaveLength(0) // no pane resolved ⇒ no teardown attempted
		expect(calls.herdrClose).toHaveLength(0)
		expect(res.pane).toBeUndefined() // ...and the result names no pane
		expect(store.resolvePaneId('%8')).toBe('neighbor') // the neighbor's pointer is untouched
		expect(store.getAgent('nopane1')).toBeUndefined() // ...while the reap still completed
		expect(store.readBrief('nopane1')).toBeUndefined()
	})
})

describe('refusing the primary checkout', () => {
	it('refuses a unit whose worktree root equals the primary checkout, and reaps nothing', () => {
		registerUnit({ id: 'c1', worktree: { root: primaryRoot } })
		const { exec, calls } = makeExec()
		expect(() => decommission({ store, env: { TMUX: 't' }, exec }, { id: 'c1' })).toThrow(/primary checkout/)
		expect(store.getAgent('c1')).toBeDefined()
		expect(calls.worktreeRemove).toHaveLength(0)
		// ...and its LIVE session pane is left running. The refusal protects the checkout; killing the
		// pane on the way out would still destroy the session the operator is sitting in.
		expect(calls.tmuxKill).toHaveLength(0)
	})

	it('--force does not override the refusal', () => {
		registerUnit({ id: 'c2', worktree: { root: primaryRoot } })
		const { exec, calls } = makeExec()
		expect(() => decommission({ store, env: { TMUX: 't' }, exec }, { id: 'c2', force: true })).toThrow(
			/primary checkout/,
		)
		expect(store.getAgent('c2')).toBeDefined()
		expect(calls.worktreeRemove).toHaveLength(0)
		expect(calls.tmuxKill).toHaveLength(0)
	})
})

describe('dirty-worktree refusal', () => {
	it('refuses a unit with uncommitted changes, leaving the close retryable', () => {
		registerUnit({ id: 'd1' })
		writePaneFile('%9', 'd1')
		writeData('d1')
		const { exec, calls } = makeExec({ dirty: true })
		expect(() => decommission({ store, env: { TMUX: 't' }, exec }, { id: 'd1' })).toThrow(/uncommitted/)
		expect(store.getAgent('d1')).toBeDefined()
		// the uncommitted work itself is still on disk — the refusal exists to protect it
		expect(existsSync(worktreeRoot)).toBe(true)
		expect(calls.worktreeRemove).toHaveLength(0)
		// ...and every piece the retry needs survives: a half-reap that dropped the pane pointer or
		// the brief would leave `unit close <id>` unable to finish the job on a second run
		expect(store.resolvePaneId('%9')).toBe('d1')
		expect(store.readBrief('d1')).toBe('brief')
		expect(calls.tmuxKill).toHaveLength(0)
	})

	it('with --force tears down a dirty worktree and reaps the record', () => {
		registerUnit({ id: 'd2' })
		const { exec, calls } = makeExec({ dirty: true })
		decommission({ store, env: { TMUX: 't' }, exec }, { id: 'd2', force: true })
		expect(calls.worktreeRemove).toHaveLength(1)
		expect(calls.worktreeRemove[0]).toContain(worktreeRoot) // this unit's worktree, not a parent
		expect(store.getAgent('d2')).toBeUndefined()
	})
})

describe('unknown id', () => {
	it('errors and reaps nothing when no agent is registered', () => {
		const { exec } = makeExec()
		expect(() => decommission({ store, env: { TMUX: 't' }, exec }, { id: 'ghost' })).toThrow(/no unit registered/)
		expect(existsSync(store.root)).toBe(false)
	})

	it("leaves another registered unit's record, pane pointer and data untouched", () => {
		// An empty hub cannot tell "reaped nothing" apart from "had nothing to reap". One bystander
		// unit makes the absence of collateral damage observable.
		registerUnit({ id: 'bystander' })
		writePaneFile('%9', 'bystander')
		writeData('bystander')
		const { exec, calls } = makeExec()
		expect(() => decommission({ store, env: { TMUX: 't' }, exec }, { id: 'ghost' })).toThrow(/no unit registered/)
		expect(store.getAgent('bystander')).toBeDefined()
		expect(store.resolvePaneId('%9')).toBe('bystander')
		expect(store.readBrief('bystander')).toBe('brief')
		expect(calls.worktreeRemove).toHaveLength(0)
		expect(calls.tmuxKill).toHaveLength(0)
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

	it('completes the reap when the herdr backend refuses the teardown', () => {
		// This case used to hand `tmuxKillPane: () => null` and call it a backend failure. cyber-mux
		// ignores `exec`'s return value on teardown, so nothing failed — the fixture drove an ordinary
		// successful reap already covered above, and the tolerance it claimed to test was unbound on
		// this route. A THROWING backend is the real failure, and herdr is the adapter the tmux case
		// higher up never reaches.
		registerUnit({ id: 'e2', pane: null })
		writePaneFile('herdr-pane-9', 'e2')
		writeData('e2')
		const { exec: base } = makeExec()
		const exec: Exec = (cmd, args) => {
			if (cmd === 'herdr' && args[0] === 'pane' && args[1] === 'close') throw new Error('no such pane herdr-pane-9')
			return base(cmd, args)
		}
		expect(() => decommission({ store, env: { HERDR_ENV: '1' }, exec }, { id: 'e2' })).not.toThrow()
		expect(store.getAgent('e2')).toBeUndefined()
		expect(store.resolvePaneId('herdr-pane-9')).toBeUndefined()
		expect(store.readBrief('e2')).toBeUndefined()
	})
})

describe('teardown precedes reap — a genuine failure is not tolerated', () => {
	it('aborts without reaping when worktree removal genuinely fails', () => {
		registerUnit({ id: 'f1' })
		writeData('f1')
		const { exec, calls } = makeExec({ worktreeRemove: () => null }) // exec reports a real failure
		expect(() => decommission({ store, env: { TMUX: 't' }, exec }, { id: 'f1' })).toThrow(/aborted|removal failed/)
		expect(store.getAgent('f1')).toBeDefined()
		expect(store.readBrief('f1')).toBe('brief')
		// The contract is the ORDERING, not the throw: an implementation that tore the pane down and
		// only then threw satisfies every assertion above while destroying what the retry needs.
		expect(calls.tmuxKill).toHaveLength(0)
	})
})
