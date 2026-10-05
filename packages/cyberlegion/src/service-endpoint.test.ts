import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { wakeRecipient } from './console/doorbell.ts'
import { decommission } from './decommission.ts'
import {
	type AgentRecord,
	loadAgent,
	prune,
	register,
	registerStanding,
	resolveOwnerMailbox,
	resolveRecipient,
	saveAgent,
} from './identity.ts'
import { inbox, send } from './message.ts'
import { type ProjectRecord, registerProject } from './project.ts'
import { injectInbox } from './runtime/inject-inbox.ts'
import { acquireService, bindService, releaseService, resolveService, type ServiceContext } from './service.ts'
import { FileStore } from './store/file-store.ts'

let base: string
let store: FileStore
let clock: number
let project: ProjectRecord
let live: Set<string>

function git(cwd: string, ...args: string[]): void {
	execFileSync('git', args, { cwd, stdio: 'ignore' })
}

/** A fresh git repository at `<base>/<parent>/<name>`, registered as a project. */
function repo(parent: string, name: string): ProjectRecord {
	const dir = join(base, parent, name)
	mkdirSync(dir, { recursive: true })
	git(dir, 'init', '-q', '-b', 'main')
	return registerProject({ store }, { dir })
}

beforeEach(() => {
	base = mkdtempSync(join(tmpdir(), 'cl-svc-ep-'))
	store = new FileStore(join(base, 'hub'))
	clock = Date.parse('2026-09-14T00:00:00.000Z')
	live = new Set()
	project = repo('a', 'alpha')
})

/** Liveness is injected: a unit is live when the test says so, never by probing a real pane. */
function ctx(): ServiceContext {
	return { store, now: () => clock, isLive: (u) => live.has(u.id) }
}

function unit(id: string): AgentRecord {
	const rec: AgentRecord = {
		id,
		handle: id,
		harness: 'claude',
		cwd: base,
		pane: { mux: 'tmux', id: `%${id}` },
		status: 'active',
		createdAt: new Date(clock).toISOString(),
		lastSeen: new Date(clock).toISOString(),
	}
	saveAgent(store, rec)
	live.add(id)
	return rec
}

/** acquire → bind in one step, for tests whose subject is what happens after an owner exists. */
function start(unitId: string, projectId = project.id): number {
	const res = acquireService(ctx(), projectId, 'controller')
	if (res.outcome !== 'reserved') throw new Error(`expected a reservation, got ${res.outcome}`)
	bindService(ctx(), projectId, 'controller', { generation: res.lease.generation, token: res.token, unit: unitId })
	return res.lease.generation
}

const endpointId = () => `svc-${project.id}-controller`

describe('spec:cyberlegion/service/endpoint — creation', () => {
	it('the first acquire of a service creates its endpoint record', () => {
		acquireService(ctx(), project.id, 'controller')

		const rec = loadAgent(store, endpointId())
		expect(rec).toMatchObject({
			id: endpointId(),
			kind: 'service',
			handle: 'controller@alpha',
			service: { project: project.id, name: 'controller' },
			cwd: project.root,
			pane: null,
			status: 'active',
		})
		expect(rec?.harness).toBeUndefined()
	})

	it('resolving a service that was never acquired creates no endpoint record', () => {
		expect(() => resolveService(ctx(), project.id, 'controller')).toThrow(/no service "controller"/)
		expect(loadAgent(store, endpointId())).toBeUndefined()
	})

	it('an invalid service name creates no endpoint record', () => {
		expect(() => acquireService(ctx(), project.id, 'Bad Name')).toThrow(/invalid service name/)
		expect(store.listAgents().filter((a) => a.kind === 'service')).toEqual([])
	})

	it('a later acquire reuses the endpoint record unchanged', () => {
		acquireService(ctx(), project.id, 'controller')
		const before = loadAgent(store, endpointId())
		clock += 10 * 60_000

		acquireService(ctx(), project.id, 'controller')
		expect(loadAgent(store, endpointId())).toEqual(before)
		expect(store.listAgents().filter((a) => a.kind === 'service')).toHaveLength(1)
	})

	it('a deleted endpoint record is recreated under the same id by the next acquire', () => {
		acquireService(ctx(), project.id, 'controller')
		store.removeAgent(endpointId())

		clock += 10 * 60_000
		acquireService(ctx(), project.id, 'controller')
		expect(loadAgent(store, endpointId())?.kind).toBe('service')
	})
})

describe('spec:cyberlegion/service/endpoint — mail', () => {
	it("mail sent to the endpoint's handle lands in the endpoint's inbox", () => {
		unit('sender')
		acquireService(ctx(), project.id, 'controller')

		send({ store }, { fromId: 'sender', to: 'controller@alpha', body: 'work' })
		expect(inbox({ store }, { meId: endpointId(), unread: true }).map((m) => m.body)).toEqual(['work'])
	})

	it('mail sent to an endpoint rings no pane, even while the service has an owner', async () => {
		unit('sender')
		unit('owner')
		start('owner')
		send({ store }, { fromId: 'sender', to: endpointId(), body: 'work' })

		let adapterAsked = false
		const res = await wakeRecipient(
			store,
			() => {
				adapterAsked = true
				throw new Error('no ring expected')
			},
			() => null,
			{ toId: endpointId(), fromId: 'sender' },
		)
		expect(res.rung).toBe(false)
		expect(res.pane).toBeUndefined()
		expect(adapterAsked).toBe(false)
	})

	it("an endpoint's unread mail is not surfaced as owner mail", () => {
		const root = register(
			{ store, env: { TMUX: 't', TMUX_PANE: '%1' }, exec: () => null },
			{ handle: 'root', harness: 'claude' },
		)
		const owner = registerStanding({ store }, { handle: 'boss' })
		acquireService(ctx(), project.id, 'controller')
		send({ store }, { fromId: root.id, to: owner.id, body: 'standing report' })
		send({ store }, { fromId: root.id, to: endpointId(), body: 'service work' })

		const text = injectInbox({ store, env: { CYBERLEGION_AGENT_ID: root.id } }, 'SessionStart')?.hookSpecificOutput
			.additionalContext
		expect(text).toContain('standing report')
		expect(text).not.toContain('service work')
		expect(text).not.toContain('controller@alpha')
	})

	it("mail inbox --owner resolves the endpoint's handle to the endpoint's inbox", () => {
		acquireService(ctx(), project.id, 'controller')
		expect(resolveOwnerMailbox(store, 'controller@alpha')).toBe(endpointId())
	})

	it('mail inbox --owner fails loud on a handle that two endpoints share', () => {
		const twin = repo('b', 'alpha')
		acquireService(ctx(), project.id, 'controller')
		acquireService(ctx(), twin.id, 'controller')

		expect(() => resolveOwnerMailbox(store, 'controller@alpha')).toThrow(/names 2 service endpoints/)
		expect(resolveOwnerMailbox(store, `svc-${twin.id}-controller`)).toBe(`svc-${twin.id}-controller`)
	})

	it('mail send --to fails loud on a handle that two endpoints share', () => {
		const twin = repo('b', 'alpha')
		acquireService(ctx(), project.id, 'controller')
		acquireService(ctx(), twin.id, 'controller')
		unit('sender')

		expect(() => send({ store }, { fromId: 'sender', to: 'controller@alpha', body: 'work' })).toThrow(
			/"controller@alpha" names 2 units — pass an id/,
		)
		expect(inbox({ store }, { meId: endpointId() })).toHaveLength(0)
		expect(inbox({ store }, { meId: `svc-${twin.id}-controller` })).toHaveLength(0)
		expect(resolveRecipient(store, `svc-${twin.id}-controller`)).toBe(`svc-${twin.id}-controller`)
	})
})

describe('spec:cyberlegion/service/endpoint — lifecycle', () => {
	it("the endpoint's id and pending mail survive replacing its owner", () => {
		unit('u1')
		unit('sender')
		start('u1')
		send({ store }, { fromId: 'sender', to: endpointId(), body: 'pending work' })

		live.delete('u1')
		unit('u2')
		start('u2')

		const after = resolveService(ctx(), project.id, 'controller')
		expect(after.endpoint.id).toBe(endpointId())
		expect(after.lease.holder).toBe('u2')
		expect(inbox({ store }, { meId: endpointId(), unread: true }).map((m) => m.body)).toEqual(['pending work'])
	})

	it('releasing a service keeps its endpoint record and pending mail', () => {
		unit('u1')
		unit('sender')
		const gen = start('u1')
		send({ store }, { fromId: 'sender', to: endpointId(), body: 'pending work' })
		const before = loadAgent(store, endpointId())

		releaseService(ctx(), project.id, 'controller', { generation: gen, unit: 'u1' })
		expect(resolveService(ctx(), project.id, 'controller').lease.state).toBe('vacant')
		expect(loadAgent(store, endpointId())).toEqual(before)
		expect(inbox({ store }, { meId: endpointId(), unread: true }).map((m) => m.body)).toEqual(['pending work'])
	})

	it('prune never marks a service endpoint exited', () => {
		acquireService(ctx(), project.id, 'controller')
		clock += 24 * 60 * 60_000
		prune({ store, now: () => clock, exec: () => null, env: {} })
		expect(loadAgent(store, endpointId())?.status).toBe('active')
	})

	it('unit close refuses a service endpoint, leaving its record and pending mail intact', () => {
		unit('sender')
		acquireService(ctx(), project.id, 'controller')
		send({ store }, { fromId: 'sender', to: endpointId(), body: 'pending work' })
		const before = loadAgent(store, endpointId())

		expect(() => decommission({ store, exec: () => null, env: {} }, { id: endpointId(), force: true })).toThrow(
			/service endpoint/,
		)
		expect(loadAgent(store, endpointId())).toEqual(before)
		expect(inbox({ store }, { meId: endpointId(), unread: true }).map((m) => m.body)).toEqual(['pending work'])
	})
})
