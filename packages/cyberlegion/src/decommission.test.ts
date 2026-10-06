import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { decommission } from './decommission.ts'
import { type AgentRecord, type Exec, saveAgent } from './identity.ts'
import { ensureMarker } from './paths.ts'
import { FileStore } from './store/file-store.ts'

// cyber-mux (>=0.8.0) prefixes every tmux call with `-u`; cyberlegion's own direct tmux calls do not.
// Fakes answer by the tmux verb, wherever it sits.
const tmuxVerb = (args: readonly string[]) => (args[0] === '-u' ? args[1] : args[0])

let store: FileStore
let worktreeRoot: string
let primaryRoot: string

beforeEach(() => {
	const tmp = mkdtempSync(join(tmpdir(), 'cl-'))
	store = new FileStore(join(tmp, 'hub'))
	worktreeRoot = join(tmp, 'unit-worktree')
	mkdirSync(worktreeRoot, { recursive: true })
	// On disk: close resolves a worktree's repository from the worktree itself, so one that exists.
	primaryRoot = join(tmp, 'repo')
	mkdirSync(primaryRoot)
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
		if (cmd === 'tmux' && tmuxVerb(args) === 'kill-pane') {
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
	it('removes the worktree through the worktree adapter and tears down the pane through the session adapter', async () => {
		registerUnit({ id: 'a1' })
		const { exec, calls } = makeExec()
		await decommission({ store, env: { TMUX: 't' }, exec }, { id: 'a1' })
		expect(calls.worktreeRemove[0]).toEqual(expect.arrayContaining(['-C', primaryRoot, 'worktree', 'remove']))
		// ...and it removes THIS unit's worktree. `arrayContaining` ignores the path argument, so a
		// remove aimed at the parent directory — which holds every sibling unit's worktree — passes it.
		expect(calls.worktreeRemove[0]).toContain(worktreeRoot)
		expect(calls.tmuxKill[0]).toEqual(['-u', 'kill-pane', '-t', '%9'])
	})

	it('completes the reap when the session pane no longer exists', async () => {
		// A pane already gone makes teardown throw. The reap must still complete — otherwise a unit
		// whose pane died first can never be closed, and its record is stranded forever.
		registerUnit({ id: 'gone1' })
		const { exec: base } = makeExec()
		const exec: Exec = (cmd, args) => {
			if (cmd === 'tmux' && tmuxVerb(args) === 'kill-pane') throw new Error("can't find pane %9")
			return base(cmd, args)
		}
		await expect(decommission({ store, env: { TMUX: 't' }, exec }, { id: 'gone1' })).resolves.not.toThrow()
		expect(store.getAgent('gone1')).toBeUndefined() // reaped regardless
	})

	it('tears down through the tmux adapter when $TMUX is set', async () => {
		registerUnit({ id: 'a2' })
		const { exec, calls } = makeExec()
		await decommission({ store, env: { TMUX: 't' }, exec }, { id: 'a2' })
		expect(calls.tmuxKill).toHaveLength(1)
		expect(calls.herdrClose).toHaveLength(0)
	})

	it('uses the herdr adapter when $TMUX is unset and $HERDR_ENV is set', async () => {
		registerUnit({ id: 'a3', pane: null })
		writePaneFile('herdr-pane-1', 'a3')
		const { exec, calls } = makeExec()
		await decommission({ store, env: { HERDR_ENV: '1' }, exec }, { id: 'a3' })
		expect(calls.herdrClose[0]).toEqual(['pane', 'close', 'herdr-pane-1'])
		expect(calls.tmuxKill).toHaveLength(0)
	})

	it("resolves a herdr unit's pane from the pane index when the record has none", async () => {
		registerUnit({ id: 'a4', pane: null })
		writePaneFile('herdr-pane-2', 'a4')
		const { exec, calls } = makeExec()
		await decommission({ store, env: { HERDR_ENV: '1' }, exec }, { id: 'a4' })
		expect(calls.herdrClose[0]).toEqual(['pane', 'close', 'herdr-pane-2'])
	})
})

describe('close on a --cwd unit removes no worktree', () => {
	it('tears down the session pane and reaps the record without touching a worktree', async () => {
		// The caller SUPPLIED this directory; close never created it, so close must never remove it.
		const suppliedDir = join(worktreeRoot, '..', 'caller-supplied')
		mkdirSync(suppliedDir, { recursive: true })
		registerUnit({ id: 'cwd1', worktree: null, cwd: suppliedDir })
		writePaneFile('%9', 'cwd1')
		writeData('cwd1')
		const { exec, calls } = makeExec()
		await decommission({ store, env: { TMUX: 't' }, exec }, { id: 'cwd1' })
		expect(calls.worktreeRemove).toHaveLength(0)
		expect(existsSync(suppliedDir)).toBe(true)
		expect(calls.tmuxKill[0]).toEqual(['-u', 'kill-pane', '-t', '%9'])
		expect(store.getAgent('cwd1')).toBeUndefined()
		expect(store.resolvePaneId('%9')).toBeUndefined()
		expect(store.readBrief('cwd1')).toBeUndefined()
	})
})

describe('reap the record', () => {
	it('reaps the agent record, pane index, and data after teardown', async () => {
		registerUnit({ id: 'b1' })
		writePaneFile('%9', 'b1')
		writeData('b1')
		const { exec } = makeExec()
		await decommission({ store, env: { TMUX: 't' }, exec }, { id: 'b1' })
		expect(store.getAgent('b1')).toBeUndefined()
		expect(store.resolvePaneId('%9')).toBeUndefined()
		expect(store.readBrief('b1')).toBeUndefined()
	})

	it("reaps only the decommissioned unit's state, leaving another unit's untouched", async () => {
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
		await decommission({ store, env: { TMUX: 't' }, exec }, { id: 'b2' })

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

describe("close deletes the unit's mailbox through the mail side", () => {
	const msg = (id: string) => ({ id, from: 'x', fromHandle: 'x', to: 'y', body: 'b', ts: 1, sentAt: 'x' })

	it("close deletes the unit's mailbox, read and unread", async () => {
		registerUnit({ id: 'mb1' })
		registerUnit({ id: 'mb2', worktree: null, cwd: worktreeRoot, pane: { mux: 'tmux', id: '%8' } })
		store.putMessage('mb1', msg('m-unread'))
		store.putMessage('mb1', msg('m-read'))
		store.ackMessage('mb1', 'm-read')
		store.putMessage('mb2', msg('m-other'))
		await decommission({ store, env: { TMUX: 't' }, exec: makeExec().exec }, { id: 'mb1' })
		expect(store.listInbox('mb1')).toEqual({ unread: [], read: [] })
		expect(store.listInbox('mb2').unread.map((m) => m.id)).toEqual(['m-other'])
	})
})

describe('a unit no pane can be resolved for', () => {
	it('reaps it, tearing nothing down and touching no other unit pane pointer', async () => {
		// No pane on the record and no index entry of its own. The index is NOT empty — it holds
		// another unit's live pane — so a reverse lookup that matched the first entry it found, or a
		// reap that cleared the whole index, is visible here rather than passing against an empty dir.
		registerUnit({ id: 'nopane1', pane: null })
		writeData('nopane1')
		registerUnit({ id: 'neighbor', pane: { mux: 'tmux', id: '%8' } })
		writePaneFile('%8', 'neighbor')

		const { exec, calls } = makeExec()
		const res = await decommission({ store, env: { TMUX: 't' }, exec }, { id: 'nopane1' })

		expect(calls.tmuxKill).toHaveLength(0) // no pane resolved ⇒ no teardown attempted
		expect(calls.herdrClose).toHaveLength(0)
		expect(res.pane).toBeUndefined() // ...and the result names no pane
		expect(store.resolvePaneId('%8')).toBe('neighbor') // the neighbor's pointer is untouched
		expect(store.getAgent('nopane1')).toBeUndefined() // ...while the reap still completed
		expect(store.readBrief('nopane1')).toBeUndefined()
	})
})

describe('refusing the primary checkout', () => {
	it('refuses a unit whose worktree root equals the primary checkout, and reaps nothing', async () => {
		registerUnit({ id: 'c1', worktree: { root: primaryRoot } })
		const { exec, calls } = makeExec()
		await expect(decommission({ store, env: { TMUX: 't' }, exec }, { id: 'c1' })).rejects.toThrow(/primary checkout/)
		expect(store.getAgent('c1')).toBeDefined()
		expect(calls.worktreeRemove).toHaveLength(0)
		// ...and its LIVE session pane is left running. The refusal protects the checkout; killing the
		// pane on the way out would still destroy the session the operator is sitting in.
		expect(calls.tmuxKill).toHaveLength(0)
	})

	it('--force does not override the refusal', async () => {
		registerUnit({ id: 'c2', worktree: { root: primaryRoot } })
		const { exec, calls } = makeExec()
		await expect(decommission({ store, env: { TMUX: 't' }, exec }, { id: 'c2', force: true })).rejects.toThrow(
			/primary checkout/,
		)
		expect(store.getAgent('c2')).toBeDefined()
		expect(calls.worktreeRemove).toHaveLength(0)
		expect(calls.tmuxKill).toHaveLength(0)
	})
})

describe('dirty-worktree refusal', () => {
	it('refuses a unit with uncommitted changes, leaving the close retryable', async () => {
		registerUnit({ id: 'd1' })
		writePaneFile('%9', 'd1')
		writeData('d1')
		const { exec, calls } = makeExec({ dirty: true })
		await expect(decommission({ store, env: { TMUX: 't' }, exec }, { id: 'd1' })).rejects.toThrow(/uncommitted/)
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

	it('with --force tears down a dirty worktree and reaps the record', async () => {
		registerUnit({ id: 'd2' })
		const { exec, calls } = makeExec({ dirty: true })
		await decommission({ store, env: { TMUX: 't' }, exec }, { id: 'd2', force: true })
		expect(calls.worktreeRemove).toHaveLength(1)
		expect(calls.worktreeRemove[0]).toContain(worktreeRoot) // this unit's worktree, not a parent
		expect(store.getAgent('d2')).toBeUndefined()
	})
})

describe('keeping the worktree', () => {
	it('reaps the record, pane pointer, brief and session while leaving the worktree on disk', async () => {
		registerUnit({ id: 'k1' })
		writePaneFile('%9', 'k1')
		writeData('k1')
		const { exec, calls } = makeExec()
		await decommission({ store, env: { TMUX: 't' }, exec }, { id: 'k1', keepWorktree: true })
		// the whole point: no removal is even attempted...
		expect(calls.worktreeRemove).toHaveLength(0)
		expect(existsSync(worktreeRoot)).toBe(true)
		// ...while every OTHER piece of the unit is reaped exactly as an ordinary close reaps it. A
		// keep path that also skipped the reap would leave the record leaking, which is the very
		// thing this flag exists to avoid.
		expect(calls.tmuxKill[0]).toEqual(['-u', 'kill-pane', '-t', '%9'])
		expect(store.getAgent('k1')).toBeUndefined()
		expect(store.resolvePaneId('%9')).toBeUndefined()
		expect(store.readBrief('k1')).toBeUndefined()
	})

	it('reports the retained path so a pool can pick the worktree up', async () => {
		registerUnit({ id: 'k2' })
		const { exec } = makeExec()
		const res = await decommission({ store, env: { TMUX: 't' }, exec }, { id: 'k2', keepWorktree: true })
		expect(res.retainedWorktree).toBe(worktreeRoot)
		expect(res.worktreeRoot).toBe(worktreeRoot)
	})

	it('reports no retained path on an ordinary close, which removed the worktree', async () => {
		// Without this, `retainedWorktree` set unconditionally to the recorded root passes the test
		// above while telling a pool manager that a DELETED directory is reusable.
		registerUnit({ id: 'k3' })
		const { exec: e3, calls } = makeExec()
		const res = await decommission({ store, env: { TMUX: 't' }, exec: e3 }, { id: 'k3' })
		expect(calls.worktreeRemove).toHaveLength(1)
		expect(res.retainedWorktree).toBeUndefined()
	})

	it('reports no retained path when the worktree was already gone from disk', async () => {
		// Nothing was kept — there was nothing there. Reporting the recorded root here would hand a
		// pool a path that does not exist.
		registerUnit({ id: 'k4', worktree: { root: join(worktreeRoot, 'gone') } })
		const { exec, calls } = makeExec()
		const res = await decommission({ store, env: { TMUX: 't' }, exec }, { id: 'k4', keepWorktree: true })
		expect(res.retainedWorktree).toBeUndefined()
		expect(calls.worktreeRemove).toHaveLength(0)
		expect(store.getAgent('k4')).toBeUndefined()
	})

	it('keeps a DIRTY worktree without --force — nothing is discarded, so nothing needs guarding', async () => {
		// The dirty refusal protects uncommitted work from `git worktree remove`. Under keep-worktree
		// there is no removal, so the refusal would only force the operator toward `--force` — the
		// strictly MORE destructive flag — to get the strictly LESS destructive outcome.
		registerUnit({ id: 'k5' })
		writeData('k5')
		const { exec, calls } = makeExec({ dirty: true })
		const res = await decommission({ store, env: { TMUX: 't' }, exec }, { id: 'k5', keepWorktree: true })
		expect(res.retainedWorktree).toBe(worktreeRoot)
		expect(calls.worktreeRemove).toHaveLength(0)
		expect(existsSync(worktreeRoot)).toBe(true)
		expect(store.getAgent('k5')).toBeUndefined()
		expect(store.readBrief('k5')).toBeUndefined()
	})

	it('still refuses the primary checkout, and reaps nothing', async () => {
		// keep-worktree relaxes destructiveness; the primary-checkout guard is not about
		// destructiveness — closing it would also kill the session the operator is sitting in and
		// reap the record for the primary checkout. It stays unconditional.
		registerUnit({ id: 'k6', worktree: { root: primaryRoot } })
		writePaneFile('%9', 'k6')
		const { exec, calls } = makeExec()
		await expect(decommission({ store, env: { TMUX: 't' }, exec }, { id: 'k6', keepWorktree: true })).rejects.toThrow(
			/primary checkout/,
		)
		expect(store.getAgent('k6')).toBeDefined()
		expect(store.resolvePaneId('%9')).toBe('k6')
		expect(calls.worktreeRemove).toHaveLength(0)
		expect(calls.tmuxKill).toHaveLength(0)
	})

	it('refuses the primary checkout with --keep-worktree AND --force together', async () => {
		registerUnit({ id: 'k7', worktree: { root: primaryRoot } })
		const { exec, calls } = makeExec()
		await expect(
			decommission({ store, env: { TMUX: 't' }, exec }, { id: 'k7', keepWorktree: true, force: true }),
		).rejects.toThrow(/primary checkout/)
		expect(store.getAgent('k7')).toBeDefined()
		expect(calls.worktreeRemove).toHaveLength(0)
		expect(calls.tmuxKill).toHaveLength(0)
	})
})

describe('unknown id', () => {
	it('errors and reaps nothing when no agent is registered', async () => {
		const { exec } = makeExec()
		await expect(decommission({ store, env: { TMUX: 't' }, exec }, { id: 'ghost' })).rejects.toThrow(
			/no unit registered/,
		)
		expect(existsSync(store.root)).toBe(false)
	})

	it("leaves another registered unit's record, pane pointer and data untouched", async () => {
		// An empty hub cannot tell "reaped nothing" apart from "had nothing to reap". One bystander
		// unit makes the absence of collateral damage observable.
		registerUnit({ id: 'bystander' })
		writePaneFile('%9', 'bystander')
		writeData('bystander')
		const { exec, calls } = makeExec()
		await expect(decommission({ store, env: { TMUX: 't' }, exec }, { id: 'ghost' })).rejects.toThrow(
			/no unit registered/,
		)
		expect(store.getAgent('bystander')).toBeDefined()
		expect(store.resolvePaneId('%9')).toBe('bystander')
		expect(store.readBrief('bystander')).toBe('brief')
		expect(calls.worktreeRemove).toHaveLength(0)
		expect(calls.tmuxKill).toHaveLength(0)
	})
})

describe('idempotent reap (already-gone is tolerated)', () => {
	it('completes the reap when the worktree no longer exists on disk', async () => {
		registerUnit({ id: 'e1', worktree: { root: join(worktreeRoot, 'gone') } })
		writeData('e1')
		const { exec, calls } = makeExec()
		await decommission({ store, env: { TMUX: 't' }, exec }, { id: 'e1' })
		expect(calls.worktreeRemove).toHaveLength(0) // never even attempted — nothing on disk to remove
		expect(store.getAgent('e1')).toBeUndefined()
		expect(store.readBrief('e1')).toBeUndefined()
	})

	it('completes the reap when the herdr backend refuses the teardown', async () => {
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
		await expect(decommission({ store, env: { HERDR_ENV: '1' }, exec }, { id: 'e2' })).resolves.not.toThrow()
		expect(store.getAgent('e2')).toBeUndefined()
		expect(store.resolvePaneId('herdr-pane-9')).toBeUndefined()
		expect(store.readBrief('e2')).toBeUndefined()
	})
})

describe('teardown precedes reap — a genuine failure is not tolerated', () => {
	it('aborts without reaping when worktree removal genuinely fails', async () => {
		registerUnit({ id: 'f1' })
		writeData('f1')
		const { exec, calls } = makeExec({ worktreeRemove: () => null }) // exec reports a real failure
		await expect(decommission({ store, env: { TMUX: 't' }, exec }, { id: 'f1' })).rejects.toThrow(
			/aborted|removal failed/,
		)
		expect(store.getAgent('f1')).toBeDefined()
		expect(store.readBrief('f1')).toBe('brief')
		// The contract is the ORDERING, not the throw: an implementation that tore the pane down and
		// only then threw satisfies every assertion above while destroying what the retry needs.
		expect(calls.tmuxKill).toHaveLength(0)
	})
})

/** A git repo with one commit, at `<tmp>/<name>`. */
function makeRepo(tmp: string, name: string): string {
	const repo = join(tmp, name)
	mkdirSync(repo)
	const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, stdio: 'ignore' })
	git('init', '-q', '-b', 'main')
	writeFileSync(join(repo, 'file.txt'), 'one\n')
	git('add', 'file.txt')
	git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'init')
	return repo
}

/** The exec seam, run from `cwd` — where the CALLER of close sits, which a git call with no `-C`
 * would resolve against. */
function execFrom(cwd: string): Exec {
	return (cmd, args) => {
		try {
			return execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
		} catch {
			return null
		}
	}
}

/** Whether `repo` still has a worktree registered at `path` — git's metadata, not the directory. */
function registeredWorktree(repo: string, path: string): boolean {
	const list = execFileSync('git', ['worktree', 'list', '--porcelain'], { cwd: repo, encoding: 'utf8' })
	return list.split('\n').some((line) => line === `worktree ${path}`)
}

// Real git, not the fake above: the fake answers `worktree remove` whatever its flags, which is how
// a `--force` close that git itself refused (#37) passed every test here.
describe('spec:cyberlegion/unit/lifecycle — closing a real git worktree', () => {
	let tmp: string
	let repo: string
	let unitRoot: string
	let gitExec: Exec

	beforeEach(() => {
		tmp = mkdtempSync(join(tmpdir(), 'cl-git-'))
		repo = makeRepo(tmp, 'repo')
		unitRoot = join(tmp, 'repo.worktrees', 'unit')
		execFileSync('git', ['worktree', 'add', '-q', '-b', 'cyberlegion/unit-g', unitRoot], { cwd: repo, stdio: 'ignore' })
		gitExec = execFrom(repo)
	})

	function register(id: string, primary?: string): void {
		registerUnit({
			id,
			cwd: unitRoot,
			worktree: { root: unitRoot, branch: 'cyberlegion/unit-g', ...(primary ? { primaryRoot: primary } : {}) },
			pane: null,
		})
	}

	// A fleet-level caller closes units from wherever its own session runs — usually another repository.
	describe("resolves the unit's repository from its worktree, not from the caller", () => {
		it('removes the worktree when close is called from an unrelated repository', async () => {
			register('x1')
			const other = makeRepo(tmp, 'other')
			await decommission({ store, env: {}, exec: execFrom(other) }, { id: 'x1' })
			expect(existsSync(unitRoot)).toBe(false)
			expect(registeredWorktree(repo, unitRoot)).toBe(false)
			expect(store.getAgent('x1')).toBeUndefined()
		})

		it('removes the worktree when close is called from a directory outside any repository', async () => {
			register('x2')
			const plain = join(tmp, 'plain')
			mkdirSync(plain)
			await decommission({ store, env: {}, exec: execFrom(plain) }, { id: 'x2' })
			expect(existsSync(unitRoot)).toBe(false)
			expect(registeredWorktree(repo, unitRoot)).toBe(false)
			expect(store.getAgent('x2')).toBeUndefined()
		})

		it('removes the worktree when close is called from inside the same repository', async () => {
			register('x3')
			await decommission({ store, env: {}, exec: execFrom(unitRoot) }, { id: 'x3' })
			expect(existsSync(unitRoot)).toBe(false)
			expect(registeredWorktree(repo, unitRoot)).toBe(false)
			expect(store.getAgent('x3')).toBeUndefined()
		})

		it("refuses a unit whose worktree is its own repository's primary checkout, from another repository", async () => {
			registerUnit({ id: 'x4', cwd: repo, worktree: { root: repo }, pane: null })
			const other = makeRepo(tmp, 'other')
			await expect(decommission({ store, env: {}, exec: execFrom(other) }, { id: 'x4' })).rejects.toThrow(
				/primary checkout/,
			)
			expect(existsSync(repo)).toBe(true)
			expect(store.getAgent('x4')).toBeDefined()
		})
	})

	// A removal that got as far as the directory and no further leaves git's registration behind; the
	// retry finds no directory, so it must clear that registration in the unit's own repository.
	it('a close of a worktree already gone from disk prunes its stale registration in the recorded repository', async () => {
		register('p1', repo)
		rmSync(unitRoot, { recursive: true, force: true })
		expect(registeredWorktree(repo, unitRoot)).toBe(true)
		const other = makeRepo(tmp, 'other')
		await decommission({ store, env: {}, exec: execFrom(other) }, { id: 'p1' })
		expect(registeredWorktree(repo, unitRoot)).toBe(false)
		expect(store.getAgent('p1')).toBeUndefined()
	})

	it('--force removes a worktree holding untracked and modified files', async () => {
		register('g1')
		writeFileSync(join(unitRoot, 'untracked.txt'), 'new\n')
		writeFileSync(join(unitRoot, 'file.txt'), 'two\n')
		await decommission({ store, env: {}, exec: gitExec }, { id: 'g1', force: true })
		expect(existsSync(unitRoot)).toBe(false)
		expect(store.getAgent('g1')).toBeUndefined()
	})

	it('close does not count the stamped marker as uncommitted work', async () => {
		register('g2')
		ensureMarker(join(unitRoot, '.agents', 'cyberlegion'))
		await decommission({ store, env: {}, exec: gitExec }, { id: 'g2' })
		expect(existsSync(unitRoot)).toBe(false)
		expect(store.getAgent('g2')).toBeUndefined()
	})

	it('close still refuses when the unit left work beside the marker', async () => {
		register('g3')
		ensureMarker(join(unitRoot, '.agents', 'cyberlegion'))
		writeFileSync(join(unitRoot, '.agents', 'cyberlegion', 'notes.md'), 'work\n')
		await expect(decommission({ store, env: {}, exec: gitExec }, { id: 'g3' })).rejects.toThrow(/uncommitted/)
		expect(existsSync(join(unitRoot, '.agents', 'cyberlegion', 'notes.md'))).toBe(true)
		expect(store.getAgent('g3')).toBeDefined()
	})
})
