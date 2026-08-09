import { existsSync, mkdtempSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { FileStore } from './file-store.ts'
import type { AgentRecord, Message } from './store.ts'

let store: FileStore
beforeEach(() => {
	store = new FileStore(join(mkdtempSync(join(tmpdir(), 'cl-')), 'hub'))
})

const agent = (id: string): AgentRecord => ({
	id,
	handle: id,
	harness: 'claude',
	cwd: '/x',
	status: 'active',
	createdAt: '2026-01-01T00:00:00.000Z',
	lastSeen: '2026-01-01T00:00:00.000Z',
})

const msg = (id: string): Message => ({
	id,
	from: 'a',
	fromHandle: 'a',
	to: 'b',
	body: 'hi',
	ts: 1,
	sentAt: new Date(1).toISOString(),
})

describe('ensureMarker', () => {
	it('creates the root and a config.json marker, idempotently', () => {
		store.ensureMarker()
		expect(existsSync(join(store.root, 'config.json'))).toBe(true)
	})
})

describe('agent registry', () => {
	it('putAgent/getAgent/listAgents/removeAgent round-trip', () => {
		store.putAgent(agent('a1'))
		expect(store.getAgent('a1')?.handle).toBe('a1')
		expect(store.listAgents()).toHaveLength(1)
		store.removeAgent('a1')
		expect(store.getAgent('a1')).toBeUndefined()
	})

	it('removeAgentData clears the data dir without touching the registry entry', () => {
		store.putAgent(agent('a2'))
		store.writeBrief('a2', 'brief text')
		store.removeAgentData('a2')
		expect(store.readBrief('a2')).toBeUndefined()
		expect(store.getAgent('a2')).toBeDefined()
	})
})

describe('pane index', () => {
	it('putPaneIndex/resolvePaneId/removePaneIndex round-trip', () => {
		store.putPaneIndex('%1', 'a1')
		expect(store.resolvePaneId('%1')).toBe('a1')
		store.removePaneIndex('%1')
		expect(store.resolvePaneId('%1')).toBeUndefined()
	})

	// The reverse lookup is bound on a pane id that survives filename sanitization UNCHANGED — a
	// herdr locator, which is already `[A-Za-z0-9_-]`. That is what the lookup is FOR: reaching a
	// unit whose record carries no pane locator, which in practice is the herdr route.
	//
	// It deliberately does not pin what the lookup returns for a tmux id. `findPaneByAgentId` hands
	// back the sanitized FILENAME there (`%3` → `_3`), which is not a pane id any backend accepts —
	// a filed, deliberately-unfixed defect this CR does not bless. The old assertion here froze
	// `'_1'` as the expected value, which meant the eventual fix (return the real pane id) would
	// have failed this test; a lookup bound only on sanitization-invariant ids stays green through
	// that fix and still catches a lookup that matches the wrong entry or none at all.
	it('findPaneByAgentId reaches a unit through the index when its record carries no locator', () => {
		store.putPaneIndex('herdr-pane-1', 'a1')
		store.putPaneIndex('herdr-pane-2', 'a2') // a second entry, so matching the first found is visible
		expect(store.findPaneByAgentId('a1')).toBe('herdr-pane-1')
		expect(store.findPaneByAgentId('a2')).toBe('herdr-pane-2')
		expect(store.findPaneByAgentId('nobody')).toBeUndefined()
		store.removePaneIndex('herdr-pane-1')
		expect(store.findPaneByAgentId('a1')).toBeUndefined()
	})
})

describe('mail: putMessage/listInbox/ackMessage', () => {
	it('is collision-free per message id and moves state on ack', () => {
		store.putMessage('b', msg('m1'))
		expect(store.listInbox('b').unread).toHaveLength(1)
		const acked = store.ackMessage('b', 'm1')
		expect(acked.id).toBe('m1')
		expect(store.listInbox('b').unread).toHaveLength(0)
		expect(store.listInbox('b').read).toHaveLength(1)
	})

	it('ackMessage throws on an unknown or already-acked id', () => {
		expect(() => store.ackMessage('b', 'ghost')).toThrow(/not an unread/)
	})

	it('putMessage writes exactly one file per message', () => {
		store.putMessage('b', msg('m2'))
		const dir = join(store.root, 'inbox', 'b')
		expect(readdirSync(dir)).toEqual(['m2.json'])
	})
})

describe('mail: removeMessage', () => {
	it('removes an unread message', () => {
		store.putMessage('b', msg('m3'))
		store.removeMessage('b', 'm3')
		expect(store.listInbox('b').unread).toHaveLength(0)
	})

	it('removes an already-acked message', () => {
		store.putMessage('b', msg('m4'))
		store.ackMessage('b', 'm4')
		store.removeMessage('b', 'm4')
		expect(store.listInbox('b').read).toHaveLength(0)
	})

	it('throws on an unknown message id', () => {
		expect(() => store.removeMessage('b', 'ghost')).toThrow(/not a message/)
	})
})

describe('main pane (hub-level owner-presence pointer)', () => {
	it('getMainPane is undefined when nothing is bound', () => {
		expect(store.getMainPane()).toBeUndefined()
	})

	it('setMainPane/getMainPane round-trips', () => {
		store.setMainPane('%3')
		expect(store.getMainPane()).toBe('%3')
	})

	it('setMainPane(null) clears an existing binding', () => {
		store.setMainPane('%3')
		store.setMainPane(null)
		expect(store.getMainPane()).toBeUndefined()
	})

	it('setMainPane(null) is a no-op (never throws) when nothing is bound', () => {
		expect(() => store.setMainPane(null)).not.toThrow()
		expect(store.getMainPane()).toBeUndefined()
	})

	it('setMainPane moves the binding on rebind — still exactly one bound pane', () => {
		store.setMainPane('%3')
		store.setMainPane('%9')
		expect(store.getMainPane()).toBe('%9')
	})
})
