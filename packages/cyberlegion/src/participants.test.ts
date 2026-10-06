import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { type Store as CynapseStore, openStore } from 'cynapse'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Exec } from './identity.ts'
import {
	openCynapse,
	projectAddress,
	repoSubject,
	runtimeKey,
	syncCynapse,
	syncParticipants,
	unitKey,
} from './participants.ts'
import { FileStore } from './store/file-store.ts'
import type { AgentRecord } from './store/store.ts'

let hub: FileStore
let cyn: CynapseStore
beforeEach(() => {
	hub = new FileStore(join(mkdtempSync(join(tmpdir(), 'cl-')), 'hub'))
	cyn = openStore({ path: ':memory:' })
})

function unit(id: string, over: Partial<AgentRecord> = {}): AgentRecord {
	const rec: AgentRecord = {
		id,
		handle: `h-${id}`,
		harness: 'claude',
		cwd: '/tmp',
		status: 'active',
		createdAt: '2026-01-01T00:00:00.000Z',
		lastSeen: '2026-01-01T00:00:00.000Z',
		...over,
	}
	hub.putAgent(rec)
	return rec
}

function byKey(key: string) {
	return cyn.participants().find((p) => p.key === key)
}

describe('spec:cyberlegion/unit/participants — sync', () => {
	it('a unit is registered as a live agent participant registered by its hub', () => {
		unit('aaaa000000000001')
		const res = syncParticipants(cyn, hub)
		const runtime = byKey(runtimeKey(hub.root))
		expect(runtime).toMatchObject({ kind: 'service', name: 'cyberlegion', status: 'live' })
		expect(byKey(unitKey('aaaa000000000001'))).toMatchObject({
			kind: 'agent',
			name: 'h-aaaa000000000001',
			status: 'live',
			registeredBy: runtime?.id,
		})
		expect(res.registered).toEqual(['aaaa000000000001'])
	})

	it('syncing twice changes nothing the second time', () => {
		unit('aaaa000000000001')
		syncParticipants(cyn, hub)
		const res = syncParticipants(cyn, hub)
		expect(res).toEqual({ registered: [], retired: [], renamed: [] })
	})

	it('an exited unit is retired', () => {
		const rec = unit('aaaa000000000001')
		syncParticipants(cyn, hub)
		hub.putAgent({ ...rec, status: 'exited' })
		const res = syncParticipants(cyn, hub)
		expect(byKey(unitKey(rec.id))?.status).toBe('retired')
		expect(res.retired).toEqual([rec.id])
	})

	it('a stopped unit stays live', () => {
		unit('aaaa000000000001', { status: 'stopped' })
		syncParticipants(cyn, hub)
		expect(byKey(unitKey('aaaa000000000001'))?.status).toBe('live')
	})

	it('a unit whose record is gone is retired — a closed unit, or one lost to a crash', () => {
		unit('aaaa000000000001')
		syncParticipants(cyn, hub)
		hub.removeAgent('aaaa000000000001')
		const res = syncParticipants(cyn, hub)
		expect(byKey(unitKey('aaaa000000000001'))?.status).toBe('retired')
		expect(res.retired).toEqual(['aaaa000000000001'])
	})

	it('an exited unit that was never registered is not registered', () => {
		unit('aaaa000000000001', { status: 'exited' })
		syncParticipants(cyn, hub)
		expect(byKey(unitKey('aaaa000000000001'))).toBeUndefined()
	})

	it('a new handle renames the participant and resolves', () => {
		const rec = unit('aaaa000000000001')
		syncParticipants(cyn, hub)
		hub.putAgent({ ...rec, handle: 'reviewer' })
		const res = syncParticipants(cyn, hub)
		expect(byKey(unitKey(rec.id))?.name).toBe('reviewer')
		expect(res.renamed).toEqual([rec.id])
		expect(cyn.resolveAddress('reviewer').participant.key).toBe(unitKey(rec.id))
	})

	it('a retired unit that comes back is revived under its current handle', () => {
		const rec = unit('aaaa000000000001')
		syncParticipants(cyn, hub)
		hub.putAgent({ ...rec, status: 'exited' })
		syncParticipants(cyn, hub)
		hub.putAgent({ ...rec, handle: 'back', status: 'active' })
		syncParticipants(cyn, hub)
		expect(byKey(unitKey(rec.id))).toMatchObject({ status: 'live', name: 'back' })
	})

	it('a standing owner and a service endpoint are not mirrored', () => {
		unit('aaaa000000000001', { kind: 'standing' })
		unit('aaaa000000000002', { kind: 'service' })
		syncParticipants(cyn, hub)
		expect(cyn.participants().filter((p) => p.key?.startsWith('cyberlegion:unit/'))).toEqual([])
	})

	it("a hub never retires another hub's units", () => {
		const other = new FileStore(join(mkdtempSync(join(tmpdir(), 'cl-')), 'hub'))
		other.putAgent({ ...unit('aaaa000000000001'), id: 'bbbb000000000001' })
		syncParticipants(cyn, other)
		syncParticipants(cyn, hub)
		expect(byKey(unitKey('bbbb000000000001'))?.status).toBe('live')
	})
})

describe('spec:cyberlegion/unit/participants — native ID', () => {
	it('the native ID is resolved from the origin remote through gh', () => {
		const calls: string[][] = []
		const exec: Exec = (cmd, args) => {
			calls.push([cmd, ...args])
			if (cmd === 'git') return 'git@github.com:cyberuni/cyberlegion.git'
			if (cmd === 'gh') return 'R_kgDOabc'
			return null
		}
		expect(repoSubject(exec, '/repo')).toEqual({ store: 'gh', nativeId: 'R_kgDOabc' })
		expect(calls).toContainEqual([
			'gh',
			'repo',
			'view',
			'git@github.com:cyberuni/cyberlegion.git',
			'--json',
			'id',
			'--jq',
			'.id',
		])
	})

	it('a repository with no origin remote has no subject and gh is never called', () => {
		const exec: Exec = (cmd) => {
			if (cmd === 'gh') throw new Error('gh must not run')
			return null
		}
		expect(repoSubject(exec, '/repo')).toBeUndefined()
	})

	it('is undefined when gh cannot resolve it', () => {
		const exec: Exec = (cmd) => (cmd === 'git' ? 'https://example.com/x.git' : null)
		expect(repoSubject(exec, '/repo')).toBeUndefined()
	})
})

describe('optional cynapse', () => {
	const absent = () =>
		Promise.reject(Object.assign(new Error("Cannot find package 'cynapse'"), { code: 'ERR_MODULE_NOT_FOUND' }))

	it('openCynapse is undefined when cynapse is not installed', async () => {
		expect(await openCynapse({}, absent)).toBeUndefined()
	})

	it('syncCynapse is a silent no-op when cynapse is not installed', async () => {
		unit('aaaa000000000001')
		expect(await syncCynapse(hub, {}, absent)).toBeUndefined()
	})

	it('syncCynapse writes to the store $CYNAPSE_HOME names', async () => {
		unit('aaaa000000000001')
		const home = mkdtempSync(join(tmpdir(), 'cyn-'))
		const res = await syncCynapse(hub, { CYNAPSE_HOME: home })
		expect(res?.registered).toEqual(['aaaa000000000001'])
		const shared = openStore({ path: join(home, 'cynapse.db') })
		expect(shared.participants().find((p) => p.key === unitKey('aaaa000000000001'))?.status).toBe('live')
		shared.close()
	})
})

describe('projectAddress', () => {
	const ghExec: Exec = (cmd) => (cmd === 'git' ? 'git@github.com:o/r.git' : cmd === 'gh' ? 'R_node' : null)
	const project = { id: 'prj-1', name: 'r', root: '/repo', commonDir: '/repo/.git', registeredAt: 'x' }

	it('records the resolved subject on the project, and reports no channel when cynapse has none', async () => {
		hub.putProject(project)
		const home = mkdtempSync(join(tmpdir(), 'cyn-'))
		const res = await projectAddress(hub, project, ghExec, { CYNAPSE_HOME: home })
		expect(res).toEqual({ subject: { store: 'gh', nativeId: 'R_node' } })
		expect(hub.getProject('prj-1')?.subject).toEqual({ store: 'gh', nativeId: 'R_node' })
	})

	it('a project reports the channel cynapse keys by its native ID', async () => {
		const home = mkdtempSync(join(tmpdir(), 'cyn-'))
		const shared = openStore({ path: join(home, 'cynapse.db') })
		const owner = shared.registerParticipant({ key: 'test:owner', kind: 'service', name: 'owner' }).participant
		const channel = shared.createChannel({
			handle: 'gh:o/r',
			type: 'repo',
			title: 'r',
			author: owner.id,
			subject: { store: 'gh', nativeId: 'R_node' },
			kind: 'address',
			owner: owner.id,
		})
		shared.close()
		const res = await projectAddress(hub, project, ghExec, { CYNAPSE_HOME: home })
		expect(res?.channel).toEqual({ id: channel.id, handle: 'gh:o/r' })
	})

	it('does not call gh again once the subject is recorded', async () => {
		const recorded = { ...project, subject: { store: 'gh', nativeId: 'R_node' } }
		const exec: Exec = () => {
			throw new Error('must not resolve again')
		}
		const res = await projectAddress(hub, recorded, exec, { CYNAPSE_HOME: mkdtempSync(join(tmpdir(), 'cyn-')) })
		expect(res?.subject).toEqual({ store: 'gh', nativeId: 'R_node' })
	})

	it('without cynapse the native ID is never resolved', async () => {
		const exec: Exec = () => {
			throw new Error('must not resolve')
		}
		const absent = () => Promise.reject(new Error('absent'))
		expect(await projectAddress(hub, project, exec, {}, absent)).toBeUndefined()
	})
})
