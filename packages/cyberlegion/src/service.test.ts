import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { type AgentRecord, loadAgent, prune, saveAgent } from './identity.ts'
import { inbox, send } from './message.ts'
import { registerProject } from './project.ts'
import {
	acquireService,
	bindService,
	handoffService,
	releaseService,
	resolveService,
	type ServiceContext,
	ServiceOwnershipError,
	verifyOwnership,
} from './service.ts'
import { FileStore } from './store/file-store.ts'

let base: string
let store: FileStore
let clock: number
let projectId: string
let live: Set<string>

function git(cwd: string, ...args: string[]): void {
	execFileSync('git', args, { cwd, stdio: 'ignore' })
}

beforeEach(() => {
	base = mkdtempSync(join(tmpdir(), 'cl-svc-'))
	store = new FileStore(join(base, 'hub'))
	clock = Date.parse('2026-09-14T00:00:00.000Z')
	live = new Set()
	const dir = join(base, 'alpha')
	mkdirSync(dir)
	git(dir, 'init', '-q', '-b', 'main')
	projectId = registerProject({ store }, { dir }).id
})

/** Liveness is injected: a unit is live when the test says so, never by probing a real pane. */
function ctx(): ServiceContext {
	return { store, now: () => clock, isLive: (u) => live.has(u.id) }
}

function unit(id: string, opts: { pane?: boolean; live?: boolean } = {}): AgentRecord {
	const rec: AgentRecord = {
		id,
		handle: id,
		harness: 'claude',
		cwd: base,
		pane: opts.pane === false ? null : { mux: 'tmux', id: `%${id}` },
		status: 'active',
		createdAt: new Date(clock).toISOString(),
		lastSeen: new Date(clock).toISOString(),
	}
	saveAgent(store, rec)
	if (opts.live !== false) live.add(id)
	return rec
}

/** acquire → bind in one step, for tests whose subject is what happens after an owner exists. */
function start(unitId: string): number {
	const res = acquireService(ctx(), projectId, 'controller')
	if (res.outcome !== 'reserved') throw new Error(`expected a reservation, got ${res.outcome}`)
	bindService(ctx(), projectId, 'controller', { generation: res.lease.generation, token: res.token, unit: unitId })
	return res.lease.generation
}

function codeOf(fn: () => unknown): string | undefined {
	try {
		fn()
	} catch (err) {
		if (err instanceof ServiceOwnershipError) return err.code
		throw err
	}
	return undefined
}

describe('spec:cyberlegion/service — resolve-or-start', () => {
	it('the first caller reserves a vacant service; a concurrent caller sees it starting, not a second reservation', () => {
		const first = acquireService(ctx(), projectId, 'controller')
		const second = acquireService(ctx(), projectId, 'controller')

		expect(first.outcome).toBe('reserved')
		expect(second.outcome).toBe('starting')
		expect(second.lease.generation).toBe(first.lease.generation)
	})

	it('binding the reservation makes one healthy owner that later callers resolve to', () => {
		unit('u1')
		const gen = start('u1')

		const again = acquireService(ctx(), projectId, 'controller')
		expect(again.outcome).toBe('resolved')
		expect(again.lease.holder).toBe('u1')
		expect(again.lease.generation).toBe(gen)
		expect(resolveService(ctx(), projectId, 'controller').health).toBe('healthy')
	})

	it('a failed start can be retried: an expired reservation is re-reserved under a new generation', () => {
		const failed = acquireService(ctx(), projectId, 'controller')
		if (failed.outcome !== 'reserved') throw new Error('expected reservation')
		clock += 10 * 60_000

		const retry = acquireService(ctx(), projectId, 'controller')
		expect(retry.outcome).toBe('reserved')
		expect(retry.lease.generation).toBe(failed.lease.generation + 1)

		unit('late')
		expect(
			codeOf(() =>
				bindService(ctx(), projectId, 'controller', {
					generation: failed.lease.generation,
					token: failed.token,
					unit: 'late',
				}),
			),
		).toBe('stale')
	})

	it('a failed start released explicitly is retryable immediately', () => {
		const failed = acquireService(ctx(), projectId, 'controller')
		if (failed.outcome !== 'reserved') throw new Error('expected reservation')
		releaseService(ctx(), projectId, 'controller', { generation: failed.lease.generation, token: failed.token })

		expect(acquireService(ctx(), projectId, 'controller').outcome).toBe('reserved')
	})

	it('resolving a service never creates it', () => {
		expect(() => resolveService(ctx(), projectId, 'controller')).toThrow(/no service "controller"/)
	})

	it('a service name is a path-safe token', () => {
		expect(() => acquireService(ctx(), projectId, '../escape')).toThrow(/invalid service name/)
	})
})

describe('spec:cyberlegion/service — a healthy owner is never silently stolen', () => {
	it('acquire resolves to a healthy owner instead of reserving over it', () => {
		unit('u1')
		const gen = start('u1')
		const res = acquireService(ctx(), projectId, 'controller')
		expect(res.outcome).toBe('resolved')
		expect(res.lease.generation).toBe(gen)
	})

	it('an owner whose session is gone is recovered under a new generation, and the old owner is stale', () => {
		unit('u1')
		const gen = start('u1')
		live.delete('u1')

		const res = acquireService(ctx(), projectId, 'controller')
		expect(res.outcome).toBe('reserved')
		expect(res.lease.generation).toBe(gen + 1)
		expect(codeOf(() => verifyOwnership(ctx(), projectId, 'controller', { unit: 'u1', generation: gen }))).toBe('stale')
	})

	it('an exited owner is recovered even when its liveness cannot be probed', () => {
		unit('u1', { pane: false })
		start('u1')
		const rec = loadAgent(store, 'u1') as AgentRecord
		saveAgent(store, { ...rec, status: 'exited' })

		expect(acquireService(ctx(), projectId, 'controller').outcome).toBe('reserved')
	})

	it('forcing past a healthy owner is explicit and must name the current generation', () => {
		unit('u1')
		const gen = start('u1')

		expect(codeOf(() => acquireService(ctx(), projectId, 'controller', { force: { generation: gen - 1 } }))).toBe(
			'stale',
		)
		const forced = acquireService(ctx(), projectId, 'controller', { force: { generation: gen } })
		expect(forced.outcome).toBe('reserved')
		expect(forced.lease.generation).toBe(gen + 1)
	})

	it('binding a unit that is not live is refused', () => {
		unit('ghost', { live: false })
		const res = acquireService(ctx(), projectId, 'controller')
		if (res.outcome !== 'reserved') throw new Error('expected reservation')
		expect(
			codeOf(() =>
				bindService(ctx(), projectId, 'controller', {
					generation: res.lease.generation,
					token: res.token,
					unit: 'ghost',
				}),
			),
		).toBe('unit-not-live')
	})
})

describe('spec:cyberlegion/service — handoff and fencing', () => {
	it('the holder hands off to another unit; the old holder is rejected afterwards', () => {
		unit('u1')
		unit('u2')
		const gen = start('u1')

		const after = handoffService(ctx(), projectId, 'controller', { generation: gen, from: 'u1', to: 'u2' })
		expect(after.lease.holder).toBe('u2')
		expect(after.lease.generation).toBe(gen + 1)

		expect(codeOf(() => verifyOwnership(ctx(), projectId, 'controller', { unit: 'u1', generation: gen }))).toBe('stale')
		expect(verifyOwnership(ctx(), projectId, 'controller', { unit: 'u2', generation: gen + 1 }).lease.holder).toBe('u2')
	})

	it('only the current holder at the current generation can hand off', () => {
		unit('u1')
		unit('u2')
		const gen = start('u1')

		expect(
			codeOf(() => handoffService(ctx(), projectId, 'controller', { generation: gen, from: 'u2', to: 'u2' })),
		).toBe('stale')
		handoffService(ctx(), projectId, 'controller', { generation: gen, from: 'u1', to: 'u2' })
		expect(
			codeOf(() => handoffService(ctx(), projectId, 'controller', { generation: gen, from: 'u1', to: 'u1' })),
		).toBe('stale')
	})

	it('a stale holder cannot release the current owner', () => {
		unit('u1')
		unit('u2')
		const gen = start('u1')
		handoffService(ctx(), projectId, 'controller', { generation: gen, from: 'u1', to: 'u2' })

		expect(codeOf(() => releaseService(ctx(), projectId, 'controller', { generation: gen, unit: 'u1' }))).toBe('stale')
		expect(resolveService(ctx(), projectId, 'controller').lease.holder).toBe('u2')
	})
})

describe('spec:cyberlegion/service — the endpoint outlives its runtimes', () => {
	it('mail to the service survives replacing its owner, and the reference is unchanged', () => {
		unit('u1')
		unit('sender')
		start('u1')
		const before = resolveService(ctx(), projectId, 'controller')
		send({ store }, { fromId: 'sender', to: before.endpoint.id, body: 'pending work' })

		live.delete('u1')
		unit('u2')
		const res = acquireService(ctx(), projectId, 'controller')
		if (res.outcome !== 'reserved') throw new Error('expected reservation')
		bindService(ctx(), projectId, 'controller', { generation: res.lease.generation, token: res.token, unit: 'u2' })

		const after = resolveService(ctx(), projectId, 'controller')
		expect(after.endpoint.id).toBe(before.endpoint.id)
		expect(after.lease.holder).toBe('u2')
		expect(inbox({ store }, { meId: after.endpoint.id, unread: true }).map((m) => m.body)).toEqual(['pending work'])
	})

	it('prune never reaps a service endpoint', () => {
		acquireService(ctx(), projectId, 'controller')
		const endpointId = resolveService(ctx(), projectId, 'controller').endpoint.id
		clock += 24 * 60 * 60_000
		prune({ store, now: () => clock, exec: () => null, env: {} })
		expect(loadAgent(store, endpointId)?.status).not.toBe('exited')
	})

	it('an owner with no session pane resolves but reports that control is not recoverable', () => {
		unit('sub', { pane: false })
		start('sub')
		const view = resolveService(ctx(), projectId, 'controller')
		expect(view.health).toBe('healthy')
		expect(view.control).toBe('none')
		expect(view.note).toMatch(/not recoverable/)
	})

	it('an owner with a session pane reports pane control', () => {
		unit('u1')
		start('u1')
		expect(resolveService(ctx(), projectId, 'controller').control).toBe('pane')
	})
})
