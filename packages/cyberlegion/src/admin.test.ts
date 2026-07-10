import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { migrateStore } from './admin.ts'
import { type AgentRecord, register } from './identity.ts'
import { send } from './message.ts'
import { FileStore } from './store/file-store.ts'

// Backs mux-agnostic `admin migrate` (admin.feature) — merging one hub root's registry, mailboxes,
// and briefs into another. Exercised through the store domain directly, the way the other unit
// suites drive their functions.
let source: FileStore
let dest: FileStore

function freshHub(prefix: string): FileStore {
	return new FileStore(join(mkdtempSync(join(tmpdir(), prefix)), 'hub'))
}

beforeEach(() => {
	source = freshHub('cl-mig-src-')
	dest = freshHub('cl-mig-dst-')
})

/** Register an agent into a store, keyed by a distinct pane so ids stay stable and unique. */
function registerInto(store: FileStore, handle: string, pane: string): AgentRecord {
	return register({ store, env: { TMUX: 't', TMUX_PANE: pane }, exec: () => null }, { handle, harness: 'claude' })
}

describe('admin migrate — merge one hub root into another', () => {
	it('merges agents, messages, and briefs into the destination and reports the counts', () => {
		const alice = registerInto(source, 'alice', '%1')
		const bob = registerInto(source, 'bob', '%2')
		send({ store: source, now: () => 1 }, { fromId: alice.id, to: 'bob', body: 'hi bob' })
		source.writeBrief(alice.id, 'do the thing')

		const res = migrateStore(source, dest)

		expect(dest.getAgent(alice.id)).toMatchObject({ handle: 'alice' })
		expect(dest.getAgent(bob.id)).toMatchObject({ handle: 'bob' })
		expect(dest.listInbox(bob.id).unread).toHaveLength(1)
		expect(dest.readBrief(alice.id)).toBe('do the thing')
		expect(res).toMatchObject({ agents: 2, messages: 1, briefs: 1 })
	})

	it('skips an agent record already present at the destination', () => {
		const alice = registerInto(source, 'alice', '%1')
		dest.ensureMarker()
		dest.putAgent({ ...alice, handle: 'alice-destination' })

		const res = migrateStore(source, dest)

		expect(dest.getAgent(alice.id)?.handle).toBe('alice-destination')
		expect(res.agents).toBe(0)
	})

	it("carries an already-present agent's source mail even though its record is skipped", () => {
		const alice = registerInto(source, 'alice', '%1')
		const sender = registerInto(source, 'sender', '%2')
		send({ store: source, now: () => 1 }, { fromId: sender.id, to: 'alice', body: 'for alice' })
		dest.ensureMarker()
		dest.putAgent(alice) // already present at the destination

		const res = migrateStore(source, dest)

		expect(res.agents).toBe(1) // only sender is new
		expect(dest.listInbox(alice.id).unread).toHaveLength(1)
		expect(res.messages).toBe(1)
	})

	it('re-files every message into the destination unread set, not preserving the read/unread split', () => {
		const alice = registerInto(source, 'alice', '%1')
		const bob = registerInto(source, 'bob', '%2')
		const msg = send({ store: source, now: () => 1 }, { fromId: alice.id, to: 'bob', body: 'read me' })
		source.ackMessage(bob.id, msg.id) // already acked at the source

		migrateStore(source, dest)

		const snap = dest.listInbox(bob.id)
		expect(snap.unread).toHaveLength(1)
		expect(snap.read).toHaveLength(0)
	})

	it('stamps the destination hub with the tracked marker', () => {
		registerInto(source, 'alice', '%1')

		migrateStore(source, dest)

		expect(existsSync(join(dest.root, 'config.json'))).toBe(true)
	})
})
