import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { type AgentRecord, register } from '../identity.ts'
import { ack, inbox, send } from '../message.ts'
import { FileStore } from '../store/file-store.ts'
import { watchMail } from './watch.ts'

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

describe('watchMail', () => {
	it('streams only NEW matching messages that arrive after watch started, in arrival order', async () => {
		send({ store, now: () => 1 }, { fromId: alice.id, to: 'bob', body: 'already here', thread: 'cr-1' })

		const seen: string[] = []
		let iteration = 0
		await watchMail({ store }, { meId: bob.id, thread: 'cr-1' }, (msg) => seen.push(msg.body), {
			sleep: async () => {
				iteration++
				if (iteration === 1)
					send({ store, now: () => 2 }, { fromId: alice.id, to: 'bob', body: 'new one', thread: 'cr-1' })
			},
			maxIterations: 3,
		})

		expect(seen).toEqual(['new one'])
	})

	it('does not ack the messages it prints — they remain unread', async () => {
		let printed = false
		await watchMail(
			{ store },
			{ meId: bob.id },
			() => {
				printed = true
			},
			{
				sleep: async () => {
					if (!printed) send({ store, now: () => 1 }, { fromId: alice.id, to: 'bob', body: 'hi' })
				},
				maxIterations: 2,
			},
		)
		expect(inbox({ store }, { meId: bob.id, unread: true })).toHaveLength(1)
	})

	it('filters by --from', async () => {
		const carol = register(
			{ store, env: { TMUX: 't', TMUX_PANE: '%3' }, exec: () => null },
			{ handle: 'carol', harness: 'claude' },
		)
		const seen: string[] = []
		let iteration = 0
		await watchMail({ store }, { meId: bob.id, from: 'alice' }, (msg) => seen.push(msg.body), {
			sleep: async () => {
				iteration++
				if (iteration === 1) {
					send({ store, now: () => 1 }, { fromId: carol.id, to: 'bob', body: 'from carol' })
					send({ store, now: () => 2 }, { fromId: alice.id, to: 'bob', body: 'from alice' })
				}
			},
			maxIterations: 3,
		})
		expect(seen).toEqual(['from alice'])
	})

	it('an already-acked message is not re-surfaced', async () => {
		const m = send({ store, now: () => 1 }, { fromId: alice.id, to: 'bob', body: 'old' })
		ack({ store }, bob.id, m.id)
		const seen: string[] = []
		await watchMail({ store }, { meId: bob.id }, (msg) => seen.push(msg.body), {
			sleep: async () => {},
			maxIterations: 1,
		})
		expect(seen).toEqual([])
	})
})
