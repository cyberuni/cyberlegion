import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { type AgentRecord, register } from './identity.ts'
import { ack, inbox, peek, resolveBody, send } from './message.ts'
import { FileStore } from './store/file-store.ts'

let store: FileStore
let alice: AgentRecord
let bob: AgentRecord

beforeEach(() => {
	store = new FileStore(join(mkdtempSync(join(tmpdir(), 'cl-')), 'hub'))
	alice = register(
		{ store, env: { TMUX: 't', TMUX_PANE: '%1' }, exec: () => null },
		{ handle: 'alice', harness: 'claude' },
	)
	bob = register({ store, env: { TMUX: 't', TMUX_PANE: '%2' }, exec: () => null }, { handle: 'bob', harness: 'cursor' })
})

const at = (t: number) => ({ store, now: () => t })

describe('resolveBody — flag, file, or stdin', () => {
	it('takes the body from --body, --body-file <path>, or --body-file - (stdin)', () => {
		expect(resolveBody('flag body', undefined)).toBe('flag body')
		const f = join(store.root, '..', 'body.txt')
		writeFileSync(f, 'file body')
		expect(resolveBody(undefined, f)).toBe('file body')
		expect(resolveBody(undefined, '-', () => 'stdin body')).toBe('stdin body')
		expect(() => resolveBody(undefined, undefined)).toThrow(/--body/)
	})
})

describe('send', () => {
	it('writes exactly one message into the recipient inbox', () => {
		send(at(1), { fromId: alice.id, to: 'bob', body: 'ping' })
		expect(store.listInbox(bob.id).unread).toHaveLength(1)
		const items = inbox({ store }, { meId: bob.id })
		expect(items[0]).toMatchObject({ from: alice.id, to: bob.id, body: 'ping' })
	})

	it('addresses by handle or by id', () => {
		send(at(1), { fromId: alice.id, to: 'bob', body: 'a' })
		send(at(2), { fromId: alice.id, to: bob.id, body: 'b' })
		expect(inbox({ store }, { meId: bob.id })).toHaveLength(2)
	})

	it('errors on an unknown recipient without writing a partial message', () => {
		expect(() => send(at(1), { fromId: alice.id, to: 'ghost', body: 'hi' })).toThrow(/ghost/)
		expect(store.listInbox('ghost').unread).toHaveLength(0)
	})
})

describe('collision-free, time-ordered ids', () => {
	it('sorts chronologically by id', () => {
		send(at(1000), { fromId: alice.id, to: 'bob', body: 'first' })
		send(at(2000), { fromId: alice.id, to: 'bob', body: 'second' })
		expect(inbox({ store }, { meId: bob.id }).map((m) => m.body)).toEqual(['first', 'second'])
	})

	it('two sends in the same millisecond do not clobber each other', () => {
		send(at(5000), { fromId: alice.id, to: 'bob', body: 'x' })
		send(at(5000), { fromId: alice.id, to: 'bob', body: 'y' })
		expect(store.listInbox(bob.id).unread).toHaveLength(2)
	})
})

describe('inbox', () => {
	it('--unread lists only un-acked; --from filters; empty reports nothing', () => {
		expect(inbox({ store }, { meId: bob.id })).toEqual([])
		const m = send(at(1), { fromId: alice.id, to: 'bob', body: 'a' })
		send(at(2), { fromId: alice.id, to: 'bob', body: 'b' })
		ack({ store }, bob.id, m.id)
		expect(inbox({ store }, { meId: bob.id, unread: true }).map((x) => x.body)).toEqual(['b'])
		expect(inbox({ store }, { meId: bob.id, from: 'alice' })).toHaveLength(2)
	})
})

describe('peek — reads without acking', () => {
	it('returns the message and leaves it unread', () => {
		const m = send(at(1), { fromId: alice.id, to: 'bob', body: 'hello' })
		const got = peek({ store }, bob.id, m.id)
		expect(got?.body).toBe('hello')
		expect(inbox({ store }, { meId: bob.id, unread: true })).toHaveLength(1)
	})

	it('returns undefined for an unknown message id', () => {
		expect(peek({ store }, bob.id, '9999-deadbe')).toBeUndefined()
	})
})

describe('ack acknowledges by move', () => {
	it('moves the message to the read set and drops it from the unread set', () => {
		const m = send(at(1), { fromId: alice.id, to: 'bob', body: 'hello' })
		const got = ack({ store }, bob.id, m.id)
		expect(got.body).toBe('hello')
		expect(store.listInbox(bob.id).read.map((x) => x.id)).toContain(m.id)
		expect(store.listInbox(bob.id).unread.map((x) => x.id)).not.toContain(m.id)
		expect(inbox({ store }, { meId: bob.id, unread: true })).toEqual([])
	})

	it('errors on an unknown or already-acked message', () => {
		const m = send(at(1), { fromId: alice.id, to: 'bob', body: 'once' })
		ack({ store }, bob.id, m.id)
		expect(() => ack({ store }, bob.id, m.id)).toThrow(/not an unread/)
		expect(() => ack({ store }, bob.id, '9999-deadbe')).toThrow()
	})
})
