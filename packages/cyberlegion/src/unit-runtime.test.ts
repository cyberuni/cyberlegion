import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { MuxAdapter } from 'cyber-mux'
import { beforeEach, describe, expect, it } from 'vitest'
import { type AgentRecord, type Exec, type IdContext, loadAgent, saveAgent } from './identity.ts'
import { send } from './message.ts'
import { paths } from './paths.ts'
import { LAUNCH_MAP } from './session.ts'
import { FileStore } from './store/file-store.ts'
import { type RuntimeContext, rebindUnit, restartUnit, showUnit, stopUnit } from './unit-runtime.ts'

let store: FileStore
let unitDir: string

beforeEach(() => {
	const tmp = mkdtempSync(join(tmpdir(), 'cl-rt-'))
	store = new FileStore(join(tmp, 'hub'))
	unitDir = join(tmp, 'unit-worktree')
	mkdirSync(unitDir, { recursive: true })
})

/** A tmux backend whose live pane set the test controls; every call is recorded in order. */
function tmux(opts: { live?: string[]; liveAfterKill?: string[] | null; killThrows?: boolean } = {}) {
	const calls: string[][] = []
	let killed = false
	const exec: Exec = (cmd, args) => {
		calls.push([cmd, ...args])
		if (cmd !== 'tmux') return null
		if (args[0] === 'kill-pane') {
			killed = true
			if (opts.killThrows) throw new Error("can't find pane")
			return ''
		}
		if (args[0] === 'list-panes') {
			const live = killed && opts.liveAfterKill !== undefined ? opts.liveAfterKill : (opts.live ?? [])
			return live === null ? null : live.map((id) => `${id}\tclaude\t/x\t\th\t0`).join('\n')
		}
		return null
	}
	return { exec, calls, kills: () => calls.filter((c) => c[1] === 'kill-pane') }
}

function ctx(exec: Exec, env: NodeJS.ProcessEnv = { TMUX: 't' }): IdContext {
	return { store, env, exec, now: () => 1_700_000_000_000 }
}

function unit(rec: Partial<AgentRecord> & { id: string }): AgentRecord {
	const full: AgentRecord = {
		handle: rec.id,
		harness: 'claude',
		cwd: unitDir,
		worktree: { root: unitDir, branch: `cyberlegion/unit-${rec.id}` },
		pane: { mux: 'tmux', id: '%9' },
		status: 'active',
		createdAt: '2026-01-01T00:00:00.000Z',
		lastSeen: '2026-01-01T00:00:00.000Z',
		...rec,
	}
	saveAgent(store, full)
	if (full.pane) store.putPaneIndex(full.pane.id, full.id)
	return full
}

/** A project service's endpoint: an address with a durable mailbox and no runtime of its own. */
function serviceEndpoint(): void {
	saveAgent(store, {
		id: 'svc-p1-reviewer',
		handle: 'reviewer',
		cwd: '/',
		kind: 'service',
		service: { project: 'p1', name: 'reviewer' },
		status: 'active',
		createdAt: 'x',
		lastSeen: 'x',
	})
}

const recordBytes = (id: string) => readFileSync(paths.agentFile(store.root, id), 'utf8')

describe('spec:cyberlegion/unit/runtime — unit stop', () => {
	it("stop tears down the session and keeps the unit's record, brief, and worktree", () => {
		const before = unit({ id: 'u1' })
		store.writeBrief('u1', 'the brief')
		const { exec, kills } = tmux({ live: ['%1', '%9'], liveAfterKill: ['%1'] })
		const res = stopUnit(ctx(exec), 'u1')
		expect(kills()).toEqual([['tmux', 'kill-pane', '-t', '%9']])
		const after = loadAgent(store, 'u1') as AgentRecord
		expect(after.status).toBe('stopped')
		expect(after.pane).toBeNull()
		const { status: _s, pane: _p, ...keptBefore } = before
		const { status: _s2, pane: _p2, ...keptAfter } = after
		expect(keptAfter).toEqual(keptBefore)
		expect(store.readBrief('u1')).toBe('the brief')
		expect(res.verified).toBe(true)
		expect(res.pane).toBe('%9')
	})

	it("stop removes the unit's pane pointer", () => {
		unit({ id: 'u1' })
		stopUnit(ctx(tmux({ live: ['%1', '%9'], liveAfterKill: ['%1'] }).exec), 'u1')
		expect(store.resolvePaneId('%9')).toBeUndefined()
		expect(store.findPaneByAgentId('u1')).toBeUndefined()
	})

	it("stop leaves the unit's pending mail unread in its inbox", () => {
		unit({ id: 'u1' })
		unit({ id: 'peer', pane: { mux: 'tmux', id: '%1' } })
		const msg = send({ store }, { fromId: 'peer', to: 'u1', body: 'pending' })
		stopUnit(ctx(tmux({ live: ['%1', '%9'], liveAfterKill: ['%1'] }).exec), 'u1')
		expect(store.listInbox('u1').unread.map((m) => m.id)).toEqual([msg.id])
	})

	it("mail sent to a stopped unit's handle lands in its inbox", () => {
		unit({ id: 'u1', handle: 'worker' })
		unit({ id: 'peer', pane: { mux: 'tmux', id: '%1' } })
		stopUnit(ctx(tmux({ live: ['%1', '%9'], liveAfterKill: ['%1'] }).exec), 'u1')
		const msg = send({ store }, { fromId: 'peer', to: 'worker', body: 'while stopped' })
		expect(store.listInbox('u1').unread.map((m) => m.id)).toEqual([msg.id])
	})

	it('stop fails loud when the backend still lists the pane, leaving the record unchanged', () => {
		unit({ id: 'u1' })
		const before = recordBytes('u1')
		const { exec } = tmux({ live: ['%1', '%9'], liveAfterKill: ['%1', '%9'] })
		expect(() => stopUnit(ctx(exec), 'u1')).toThrow(/did not take effect/)
		expect(recordBytes('u1')).toBe(before)
		expect(store.resolvePaneId('%9')).toBe('u1')
	})

	it('stop reports an unverified stop when the backend gives no pane list', () => {
		unit({ id: 'u1' })
		const res = stopUnit(ctx(tmux({ live: ['%9'], liveAfterKill: null }).exec), 'u1')
		expect(loadAgent(store, 'u1')?.status).toBe('stopped')
		expect(loadAgent(store, 'u1')?.pane).toBeNull()
		expect(res.verified).toBe(false)
	})

	it('stop treats a teardown that fails on an already-gone pane as a verified stop', () => {
		unit({ id: 'u1' })
		const res = stopUnit(ctx(tmux({ live: ['%1'], killThrows: true }).exec), 'u1')
		expect(loadAgent(store, 'u1')?.status).toBe('stopped')
		expect(res.verified).toBe(true)
	})

	it('stop marks a unit with no resolvable pane stopped and names no pane', () => {
		unit({ id: 'u1', pane: null })
		const { exec, kills } = tmux({ live: ['%1'] })
		const res = stopUnit(ctx(exec), 'u1')
		expect(kills()).toEqual([])
		expect(loadAgent(store, 'u1')?.status).toBe('stopped')
		expect(res.pane).toBeUndefined()
	})

	it('stop on an already-stopped unit changes nothing', () => {
		unit({ id: 'u1', status: 'stopped', pane: null })
		const before = recordBytes('u1')
		const { exec, kills } = tmux({ live: ['%1'] })
		const res = stopUnit(ctx(exec), 'u1')
		expect(res.alreadyStopped).toBe(true)
		expect(kills()).toEqual([])
		expect(recordBytes('u1')).toBe(before)
	})

	it("stop refuses the caller's own session", () => {
		unit({ id: 'u1' })
		const { exec, kills } = tmux({ live: ['%9'] })
		expect(() => stopUnit(ctx(exec, { TMUX: 't', TMUX_PANE: '%9' }), 'u1')).toThrow(/own session/)
		expect(kills()).toEqual([])
		expect(loadAgent(store, 'u1')?.status).toBe('active')
		expect(loadAgent(store, 'u1')?.pane).toEqual({ mux: 'tmux', id: '%9' })
	})

	it('stop refuses a standing record', () => {
		saveAgent(store, {
			id: 'standing-owner',
			handle: 'owner',
			cwd: '/',
			kind: 'standing',
			status: 'active',
			createdAt: 'x',
			lastSeen: 'x',
		})
		const before = recordBytes('standing-owner')
		expect(() => stopUnit(ctx(tmux().exec), 'owner')).toThrow(/no runtime/)
		expect(recordBytes('standing-owner')).toBe(before)
	})

	it('stop refuses a service endpoint', () => {
		serviceEndpoint()
		const before = recordBytes('svc-p1-reviewer')
		expect(() => stopUnit(ctx(tmux().exec), 'reviewer')).toThrow(/no runtime/)
		expect(recordBytes('svc-p1-reviewer')).toBe(before)
	})

	it('stop on an unresolvable ref errors and tears nothing down', () => {
		unit({ id: 'u1' })
		const before = recordBytes('u1')
		const { exec, kills } = tmux({ live: ['%9'] })
		expect(() => stopUnit(ctx(exec), 'no-such-unit')).toThrow(/no-such-unit/)
		expect(kills()).toEqual([])
		expect(recordBytes('u1')).toBe(before)
	})
})

/** An in-memory backend: a live pane set, an open that mints the next pane id, and a record of every
 * open/teardown/submit. `takesTurns: false` leaves every submitted text staged, so a ring never lands. */
function fakeBackend(
	opts: {
		live?: string[]
		openFails?: boolean
		takesTurns?: boolean
		keepsAfterKill?: boolean
		name?: 'tmux' | 'herdr'
	} = {},
) {
	const live = new Set(opts.live ?? [])
	const opened: { cwd: string; launch?: string; at?: string; pane: string }[] = []
	const torn: string[] = []
	const submitted: { pane: string; text: string }[] = []
	let next = 20
	let staged = ''
	const adapter = {
		name: opts.name ?? 'tmux',
		open(_exec: unknown, o: { cwd: string; launch?: string; at?: string }) {
			if (opts.openFails) throw new Error('backend refused to open')
			const pane = `%${next++}`
			live.add(pane)
			opened.push({ cwd: o.cwd, launch: o.launch, at: o.at, pane })
			return { id: pane, tab: '@1' }
		},
		teardown(_exec: unknown, t: { id: string }) {
			torn.push(t.id)
			if (!opts.keepsAfterKill) live.delete(t.id)
		},
		listPanes: () => [...live].map((id) => ({ id, mux: opts.name ?? 'tmux' })),
		paneExists: (_exec: unknown, t: { id: string }) => live.has(t.id),
		submit(_exec: unknown, t: { id: string }, text?: string) {
			if (text) {
				submitted.push({ pane: t.id, text })
				staged = opts.takesTurns === false ? text : '> working on it'
			}
		},
		read: () => ({ text: staged }),
	} as unknown as MuxAdapter
	return { adapter, opened, torn, submitted, live }
}

const noSleep = { nudgeOpts: { sleep: async () => {}, attempts: 1 } }

function rctx(adapter: MuxAdapter, env: NodeJS.ProcessEnv = { TMUX: 't' }): RuntimeContext {
	return { store, env, exec: () => null, now: () => 1_700_000_000_000, adapter }
}

describe('spec:cyberlegion/unit/runtime — unit restart', () => {
	it("restart replaces a live session and keeps the unit's id, handle, brief, and worktree", async () => {
		const before = unit({ id: 'u1', handle: 'keeper' })
		store.writeBrief('u1', 'the brief')
		const be = fakeBackend({ live: ['%1', '%9'] })
		const res = await restartUnit(rctx(be.adapter), 'u1', noSleep)
		expect(be.torn).toEqual(['%9'])
		expect(be.opened.map((o) => o.cwd)).toEqual([unitDir])
		const after = loadAgent(store, 'u1') as AgentRecord
		expect(after.status).toBe('active')
		expect(after.pane).toEqual({ mux: 'tmux', id: '%20' })
		expect([after.id, after.handle, after.harness, after.worktree]).toEqual([
			before.id,
			'keeper',
			'claude',
			before.worktree,
		])
		expect(store.readBrief('u1')).toBe('the brief')
		expect([res.previousPane, res.pane]).toEqual(['%9', '%20'])
	})

	it('restart opens a session for a stopped unit and binds it to the new pane', async () => {
		unit({ id: 'u1', status: 'stopped', pane: null })
		const be = fakeBackend({ live: ['%1'] })
		await restartUnit(rctx(be.adapter), 'u1', noSleep)
		expect(be.opened.map((o) => o.cwd)).toEqual([unitDir])
		const after = loadAgent(store, 'u1') as AgentRecord
		expect(after.status).toBe('active')
		expect(after.pane).toEqual({ mux: 'tmux', id: '%20' })
		expect(store.resolvePaneId('%20')).toBe('u1')
		expect(after.lastSeen).toBe(new Date(1_700_000_000_000).toISOString())
	})

	it('restart revives an exited unit', async () => {
		unit({ id: 'u1', status: 'exited' })
		const be = fakeBackend({ live: ['%1'] })
		await restartUnit(rctx(be.adapter), 'u1', noSleep)
		expect(be.opened.map((o) => o.cwd)).toEqual([unitDir])
		expect(loadAgent(store, 'u1')?.status).toBe('active')
		expect(loadAgent(store, 'u1')?.pane).toEqual({ mux: 'tmux', id: '%20' })
	})

	it('restart launches with the command the unit was spawned with', async () => {
		unit({ id: 'u1', status: 'stopped', pane: null, launch: 'claude --model opus' })
		const be = fakeBackend()
		await restartUnit(rctx(be.adapter), 'u1', noSleep)
		expect(be.opened[0]?.launch).toMatch(/(^| )claude --model opus$/)
	})

	it("restart falls back to the harness's default command when none was recorded", async () => {
		unit({ id: 'u1', status: 'stopped', pane: null })
		const be = fakeBackend()
		await restartUnit(rctx(be.adapter), 'u1', noSleep)
		expect(be.opened[0]?.launch).toMatch(new RegExp(`(^| )${LAUNCH_MAP.claude}$`))
	})

	it('restart opens a unit with a worktree in its own workspace', async () => {
		unit({ id: 'u1', status: 'stopped', pane: null })
		const be = fakeBackend()
		await restartUnit(rctx(be.adapter), 'u1', noSleep)
		expect(be.opened[0]?.at).toBe('workspace')
	})

	it('restart opens a --cwd unit in a tab', async () => {
		unit({ id: 'u1', status: 'stopped', pane: null, worktree: null })
		const be = fakeBackend()
		await restartUnit(rctx(be.adapter), 'u1', noSleep)
		expect(be.opened[0]?.at).toBe('tab')
	})

	it('after a restart the previous pane no longer resolves to the unit', async () => {
		unit({ id: 'u1' })
		await restartUnit(rctx(fakeBackend({ live: ['%9'] }).adapter), 'u1', noSleep)
		expect(store.resolvePaneId('%9')).toBeUndefined()
	})

	it('restart rings the new session to read its brief', async () => {
		unit({ id: 'u1', status: 'stopped', pane: null, brief: '/hub/data/u1/brief.md' })
		const be = fakeBackend()
		const res = await restartUnit(rctx(be.adapter), 'u1', noSleep)
		expect(be.submitted).toHaveLength(1)
		expect(be.submitted[0]?.pane).toBe('%20')
		expect(be.submitted[0]?.text).toContain('/hub/data/u1/brief.md')
		expect(res.warning).toBeUndefined()
		expect(res.rung).toBe(true)
	})

	it('restart --no-wake rings nothing', async () => {
		unit({ id: 'u1', status: 'stopped', pane: null, brief: '/hub/data/u1/brief.md' })
		const be = fakeBackend()
		await restartUnit(rctx(be.adapter), 'u1', { ...noSleep, noWake: true })
		expect(be.submitted).toEqual([])
		expect(loadAgent(store, 'u1')?.status).toBe('active')
	})

	it('a restart whose ring never completes still succeeds with a warning', async () => {
		unit({ id: 'u1', status: 'stopped', pane: null, brief: '/hub/data/u1/brief.md' })
		const res = await restartUnit(rctx(fakeBackend({ takesTurns: false }).adapter), 'u1', noSleep)
		expect(loadAgent(store, 'u1')?.status).toBe('active')
		expect(res.rung).toBe(false)
		expect(res.warning).toBeTruthy()
	})

	it('a restart whose open fails leaves the unit stopped', async () => {
		unit({ id: 'u1', status: 'stopped', pane: null })
		unit({ id: 'peer', pane: { mux: 'tmux', id: '%1' } })
		const msg = send({ store }, { fromId: 'peer', to: 'u1', body: 'pending' })
		await expect(restartUnit(rctx(fakeBackend({ openFails: true }).adapter), 'u1', noSleep)).rejects.toThrow(
			/stopped.*rerun|rerun.*stopped/,
		)
		expect(loadAgent(store, 'u1')?.status).toBe('stopped')
		expect(loadAgent(store, 'u1')?.pane).toBeNull()
		expect(store.listInbox('u1').unread.map((m) => m.id)).toEqual([msg.id])
	})

	it('a second restart recovers a unit left stopped by a failed restart', async () => {
		unit({ id: 'u1' })
		await expect(
			restartUnit(rctx(fakeBackend({ live: ['%9'], openFails: true }).adapter), 'u1', noSleep),
		).rejects.toThrow()
		await restartUnit(rctx(fakeBackend().adapter), 'u1', noSleep)
		expect(loadAgent(store, 'u1')?.status).toBe('active')
		expect(loadAgent(store, 'u1')?.pane).toEqual({ mux: 'tmux', id: '%20' })
	})

	it("restart opens nothing when the running session's stop does not take effect", async () => {
		unit({ id: 'u1' })
		const be = fakeBackend({ live: ['%9'], keepsAfterKill: true })
		await expect(restartUnit(rctx(be.adapter), 'u1', noSleep)).rejects.toThrow(/did not take effect/)
		expect(be.opened).toEqual([])
		expect(loadAgent(store, 'u1')?.status).toBe('active')
		expect(loadAgent(store, 'u1')?.pane).toEqual({ mux: 'tmux', id: '%9' })
	})

	it('restart refuses a unit whose cwd no longer exists and tears nothing down', async () => {
		unit({ id: 'u1' })
		rmSync(unitDir, { recursive: true })
		const be = fakeBackend({ live: ['%9'] })
		await expect(restartUnit(rctx(be.adapter), 'u1', noSleep)).rejects.toThrow(/cwd/)
		expect(be.torn).toEqual([])
		expect(be.opened).toEqual([])
	})

	it('restart refuses a harness outside the launch map and tears nothing down', async () => {
		unit({ id: 'u1', harness: 'copilot' as AgentRecord['harness'] })
		const be = fakeBackend({ live: ['%9'] })
		await expect(restartUnit(rctx(be.adapter), 'u1', noSleep)).rejects.toThrow(/launch map/)
		expect(be.torn).toEqual([])
		expect(be.opened).toEqual([])
	})

	it("restart refuses the caller's own session", async () => {
		unit({ id: 'u1' })
		const be = fakeBackend({ live: ['%9'] })
		await expect(restartUnit(rctx(be.adapter, { TMUX: 't', TMUX_PANE: '%9' }), 'u1', noSleep)).rejects.toThrow(
			/own session/,
		)
		expect(be.torn).toEqual([])
		expect(be.opened).toEqual([])
	})

	it('restart refuses a standing record', async () => {
		saveAgent(store, {
			id: 'standing-owner',
			handle: 'owner',
			cwd: '/',
			kind: 'standing',
			status: 'active',
			createdAt: 'x',
			lastSeen: 'x',
		})
		const be = fakeBackend()
		await expect(restartUnit(rctx(be.adapter), 'owner', noSleep)).rejects.toThrow(/no runtime/)
		expect(be.opened).toEqual([])
	})

	it('restart refuses a service endpoint', async () => {
		serviceEndpoint()
		const be = fakeBackend()
		await expect(restartUnit(rctx(be.adapter), 'reviewer', noSleep)).rejects.toThrow(/no runtime/)
		expect(be.opened).toEqual([])
	})

	it('restart on an unresolvable ref errors and opens nothing', async () => {
		unit({ id: 'u1' })
		const be = fakeBackend({ live: ['%9'] })
		await expect(restartUnit(rctx(be.adapter), 'no-such-unit', noSleep)).rejects.toThrow(/no-such-unit/)
		expect(be.torn).toEqual([])
		expect(be.opened).toEqual([])
	})
})

const inHerdr = (pane: string): NodeJS.ProcessEnv => ({ HERDR_ENV: '1', HERDR_PANE_ID: pane })
const herdrPane = (id: string) => ({ mux: 'herdr' as const, id })

describe('spec:cyberlegion/unit/runtime — unit rebind', () => {
	it('rebind binds a stopped unit to the calling pane', () => {
		unit({ id: 'u1', status: 'stopped', pane: null })
		const be = fakeBackend({ name: 'herdr', live: ['w1:p5'] })
		rebindUnit(rctx(be.adapter, inHerdr('w1:p5')), 'u1')
		const after = loadAgent(store, 'u1') as AgentRecord
		expect(after.status).toBe('active')
		expect(after.pane).toEqual(herdrPane('w1:p5'))
		expect(store.resolvePaneId('w1:p5')).toBe('u1')
		expect(after.lastSeen).toBe(new Date(1_700_000_000_000).toISOString())
	})

	it("rebind drops the unit's old pane pointer", () => {
		unit({ id: 'u1', status: 'exited', pane: herdrPane('w1:p2') })
		const be = fakeBackend({ name: 'herdr', live: ['w1:p5'] })
		rebindUnit(rctx(be.adapter, inHerdr('w1:p5')), 'u1')
		expect(store.resolvePaneId('w1:p2')).toBeUndefined()
		expect(store.resolvePaneId('w1:p5')).toBe('u1')
	})

	it('rebind to the pane the unit already holds changes nothing', () => {
		unit({ id: 'u1', pane: herdrPane('w1:p5') })
		const before = recordBytes('u1')
		const be = fakeBackend({ name: 'herdr', live: ['w1:p5'] })
		expect(() => rebindUnit(rctx(be.adapter, inHerdr('w1:p5')), 'u1')).not.toThrow()
		expect(recordBytes('u1')).toBe(before)
	})

	it('rebind refuses a pane that belongs to another unit', () => {
		unit({ id: 'u1', status: 'stopped', pane: null })
		unit({ id: 'other', handle: 'squatter', pane: herdrPane('w1:p5') })
		const be = fakeBackend({ name: 'herdr', live: ['w1:p5'] })
		expect(() => rebindUnit(rctx(be.adapter, inHerdr('w1:p5')), 'u1')).toThrow(/squatter/)
		expect(store.resolvePaneId('w1:p5')).toBe('other')
		expect(loadAgent(store, 'u1')?.status).toBe('stopped')
		expect(loadAgent(store, 'u1')?.pane).toBeNull()
	})

	it('rebind takes over a pane whose previous unit has exited', () => {
		unit({ id: 'u1', status: 'stopped', pane: null })
		unit({ id: 'dead', status: 'exited', pane: herdrPane('w1:p5') })
		const be = fakeBackend({ name: 'herdr', live: ['w1:p5'] })
		rebindUnit(rctx(be.adapter, inHerdr('w1:p5')), 'u1')
		expect(store.resolvePaneId('w1:p5')).toBe('u1')
		expect(loadAgent(store, 'u1')?.status).toBe('active')
		expect(loadAgent(store, 'u1')?.pane).toEqual(herdrPane('w1:p5'))
	})

	it('rebind refuses a unit that still has a live pane', () => {
		unit({ id: 'u1', pane: herdrPane('w1:p2') })
		const be = fakeBackend({ name: 'herdr', live: ['w1:p2', 'w1:p5'] })
		expect(() => rebindUnit(rctx(be.adapter, inHerdr('w1:p5')), 'u1')).toThrow(/stop/)
		expect(loadAgent(store, 'u1')?.pane).toEqual(herdrPane('w1:p2'))
		expect(store.resolvePaneId('w1:p5')).toBeUndefined()
	})

	it('rebind outside any pane refuses', () => {
		unit({ id: 'u1', status: 'stopped', pane: null })
		expect(() => rebindUnit(rctx(fakeBackend().adapter, {}), 'u1')).toThrow(/no pane/)
		expect(loadAgent(store, 'u1')?.status).toBe('stopped')
		expect(loadAgent(store, 'u1')?.pane).toBeNull()
	})

	it('rebind refuses a standing record', () => {
		saveAgent(store, {
			id: 'standing-owner',
			handle: 'owner',
			cwd: '/',
			kind: 'standing',
			status: 'active',
			createdAt: 'x',
			lastSeen: 'x',
		})
		const be = fakeBackend({ name: 'herdr', live: ['w1:p5'] })
		expect(() => rebindUnit(rctx(be.adapter, inHerdr('w1:p5')), 'owner')).toThrow(/no runtime/)
		expect(store.resolvePaneId('w1:p5')).toBeUndefined()
	})

	it('rebind refuses a service endpoint', () => {
		serviceEndpoint()
		const be = fakeBackend({ name: 'herdr', live: ['w1:p5'] })
		expect(() => rebindUnit(rctx(be.adapter, inHerdr('w1:p5')), 'reviewer')).toThrow(/no runtime/)
		expect(store.resolvePaneId('w1:p5')).toBeUndefined()
	})

	it('rebind on an unresolvable ref errors and binds nothing', () => {
		unit({ id: 'u1', status: 'stopped', pane: null })
		const be = fakeBackend({ name: 'herdr', live: ['w1:p5'] })
		expect(() => rebindUnit(rctx(be.adapter, inHerdr('w1:p5')), 'no-such-unit')).toThrow(/no-such-unit/)
		expect(store.resolvePaneId('w1:p5')).toBeUndefined()
	})
})

describe('spec:cyberlegion/unit/runtime — unit show', () => {
	it('show reports a live unit with its pane-driving controls', () => {
		unit({ id: 'u1', pane: herdrPane('w1:p2') })
		const view = showUnit(rctx(fakeBackend({ name: 'herdr', live: ['w1:p2'] }).adapter), 'u1')
		expect(view.liveness).toBe('live')
		expect(view.pane).toEqual(herdrPane('w1:p2'))
		expect(view.controls).toEqual(['focus', 'nudge', 'read', 'clear', 'stop', 'restart', 'close'])
	})

	it('show reports a gone pane without rewriting the recorded status', () => {
		unit({ id: 'u1', pane: herdrPane('w1:p2') })
		const before = recordBytes('u1')
		const view = showUnit(rctx(fakeBackend({ name: 'herdr', live: ['w1:p9'] }).adapter), 'u1')
		expect(view.liveness).toBe('gone')
		expect(view.status).toBe('active')
		expect(view.controls).toEqual(expect.arrayContaining(['stop', 'rebind']))
		expect(view.controls).not.toEqual(expect.arrayContaining(['focus']))
		expect(view.controls).not.toContain('nudge')
		expect(view.controls).not.toContain('read')
		expect(recordBytes('u1')).toBe(before)
	})

	it('show reports unknown liveness for a unit with no pane', () => {
		unit({ id: 'u1', pane: null })
		const view = showUnit(rctx(fakeBackend({ name: 'herdr', live: ['w1:p9'] }).adapter), 'u1')
		expect(view.liveness).toBe('unknown')
		for (const c of ['stop', 'focus', 'nudge', 'read']) expect(view.controls).not.toContain(c)
	})

	it('show reports unknown liveness when the backend gives no pane list', () => {
		unit({ id: 'u1', pane: herdrPane('w1:p2') })
		const view = showUnit(rctx(fakeBackend({ name: 'herdr', live: [] }).adapter), 'u1')
		expect(view.liveness).toBe('unknown')
		expect(view.controls).toContain('stop')
		for (const c of ['focus', 'nudge', 'read']) expect(view.controls).not.toContain(c)
	})

	it('show reports a stopped unit with restart and rebind but no pane controls', () => {
		unit({ id: 'u1', status: 'stopped', pane: null })
		const view = showUnit(rctx(fakeBackend({ name: 'herdr', live: ['w1:p9'] }).adapter), 'u1')
		expect(view.liveness).toBe('stopped')
		expect(view.controls).toEqual(['restart', 'rebind', 'close'])
	})

	it('show reports an exited unit with rebind but no pane controls', () => {
		unit({ id: 'u1', status: 'exited', pane: herdrPane('w1:p2') })
		const view = showUnit(rctx(fakeBackend({ name: 'herdr', live: ['w1:p2'] }).adapter), 'u1')
		expect(view.liveness).toBe('exited')
		expect(view.controls).toContain('rebind')
		for (const c of ['focus', 'nudge', 'read', 'stop']) expect(view.controls).not.toContain(c)
	})

	it('show omits clear for a harness with no honest reset command', () => {
		unit({ id: 'u1', harness: 'gemini' as AgentRecord['harness'], pane: herdrPane('w1:p2') })
		const view = showUnit(rctx(fakeBackend({ name: 'herdr', live: ['w1:p2'] }).adapter), 'u1')
		expect(view.controls).toContain('focus')
		expect(view.controls).not.toContain('clear')
	})

	it("show omits restart when the unit's cwd no longer exists", () => {
		unit({ id: 'u1', status: 'stopped', pane: null })
		rmSync(unitDir, { recursive: true })
		const view = showUnit(rctx(fakeBackend({ name: 'herdr' }).adapter), 'u1')
		expect(view.controls).not.toContain('restart')
		expect(view.controls).toContain('rebind')
	})

	it('show reports no runtime and no controls for a standing record', () => {
		saveAgent(store, {
			id: 'standing-owner',
			handle: 'owner',
			cwd: '/',
			kind: 'standing',
			status: 'active',
			createdAt: 'x',
			lastSeen: 'x',
		})
		const view = showUnit(rctx(fakeBackend().adapter), 'owner')
		expect(view.liveness).toBe('none')
		expect(view.controls).toEqual([])
	})

	it('show reports no runtime and no controls for a service endpoint', () => {
		serviceEndpoint()
		const view = showUnit(rctx(fakeBackend().adapter), 'reviewer')
		expect(view.liveness).toBe('none')
		expect(view.controls).toEqual([])
	})

	it("show leaves the target's record unchanged", () => {
		unit({ id: 'u1', pane: herdrPane('w1:p2') })
		unit({ id: 'caller', pane: herdrPane('w1:p7') })
		const before = recordBytes('u1')
		showUnit(rctx(fakeBackend({ name: 'herdr', live: ['w1:p2', 'w1:p7'] }).adapter, inHerdr('w1:p7')), 'u1')
		expect(recordBytes('u1')).toBe(before)
	})

	it('show on an unresolvable ref errors', () => {
		unit({ id: 'u1' })
		expect(() => showUnit(rctx(fakeBackend({ live: ['%9'] }).adapter), 'no-such-unit')).toThrow(/no-such-unit/)
	})
})
