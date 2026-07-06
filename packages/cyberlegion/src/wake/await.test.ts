import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { type AgentRecord, register } from '../identity.ts'
import { inbox, send } from '../message.ts'
import { FileStore } from '../store/file-store.ts'
import { awaitReply } from './await.ts'

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

/** A fake clock: `now()` is a mutable counter; `sleep` advances it by the requested ms. */
function fakeClock(start = 0) {
	let t = start
	return {
		now: () => t,
		sleep: async (ms: number) => {
			t += ms
		},
	}
}

describe('awaitReply — matched', () => {
	it('matches a thread-correlated message, prints it, and acks it (leaves the unread set)', async () => {
		const clock = fakeClock()
		send({ store, now: () => 1 }, { fromId: alice.id, to: 'bob', body: 'irrelevant', thread: 'other' })
		send({ store, now: () => 2 }, { fromId: alice.id, to: 'bob', body: 'the reply', thread: 'cr-1' })

		const outcome = await awaitReply({ store }, { meId: bob.id, thread: 'cr-1', now: clock.now, sleep: clock.sleep })

		expect(outcome).toMatchObject({ kind: 'matched', message: { body: 'the reply', thread: 'cr-1' } })
		expect(inbox({ store }, { meId: bob.id, unread: true, thread: 'cr-1' })).toEqual([])
	})

	it('honors --from alongside --thread', async () => {
		const clock = fakeClock()
		send({ store, now: () => 1 }, { fromId: alice.id, to: 'bob', body: 'from carol not matched', thread: 'cr-1' })
		const carol = register(
			{ store, env: { TMUX: 't', TMUX_PANE: '%3' }, exec: () => null },
			{ handle: 'carol', harness: 'claude' },
		)
		send({ store, now: () => 2 }, { fromId: carol.id, to: 'bob', body: 'from carol', thread: 'cr-1' })

		const outcome = await awaitReply(
			{ store },
			{
				meId: bob.id,
				thread: 'cr-1',
				from: 'carol',
				now: clock.now,
				sleep: clock.sleep,
			},
		)
		expect(outcome.kind === 'matched' && outcome.message.body).toBe('from carol')
	})

	it('polls until a matching message arrives after a delay', async () => {
		const clock = fakeClock()
		let sent = false
		const outcome = await awaitReply(
			{ store },
			{
				meId: bob.id,
				thread: 'cr-1',
				now: clock.now,
				sleep: async (ms) => {
					await clock.sleep(ms)
					if (!sent) {
						sent = true
						send({ store, now: clock.now }, { fromId: alice.id, to: 'bob', body: 'late reply', thread: 'cr-1' })
					}
				},
			},
		)
		expect(outcome).toMatchObject({ kind: 'matched', message: { body: 'late reply' } })
	})
})

describe('awaitReply — timed-out', () => {
	it('exits with a distinct timed-out outcome once the overall timeout elapses with no match', async () => {
		const clock = fakeClock()
		const outcome = await awaitReply(
			{ store },
			{ meId: bob.id, thread: 'cr-1', timeoutMs: 5000, maxWaitS: 1000, now: clock.now, sleep: clock.sleep },
		)
		expect(outcome).toEqual({ kind: 'timed-out' })
	})

	it('--timeout 0 never times out (bounded only by max-wait)', async () => {
		const clock = fakeClock()
		const outcome = await awaitReply(
			{ store },
			{ meId: bob.id, thread: 'cr-1', timeoutMs: 0, maxWaitS: 1, now: clock.now, sleep: clock.sleep },
		)
		// with timeoutMs 0 the cycle cap (maxWaitS) is what returns first — a clean 'waiting', not 'timed-out'.
		expect(outcome).toEqual({ kind: 'waiting' })
	})
})

describe('awaitReply — waiting (clean max-wait sentinel)', () => {
	it('returns a distinct clean "waiting" outcome when the per-cycle max-wait cap is hit before the overall timeout', async () => {
		const clock = fakeClock()
		const outcome = await awaitReply(
			{ store },
			{ meId: bob.id, thread: 'cr-1', timeoutMs: 600_000, maxWaitS: 5, now: clock.now, sleep: clock.sleep },
		)
		expect(outcome).toEqual({ kind: 'waiting' })
	})

	it('a subsequent call (re-arm) still matches a message sent in between', async () => {
		const clock = fakeClock()
		const first = await awaitReply(
			{ store },
			{ meId: bob.id, thread: 'cr-1', timeoutMs: 600_000, maxWaitS: 2, now: clock.now, sleep: clock.sleep },
		)
		expect(first.kind).toBe('waiting')

		send({ store, now: () => 999 }, { fromId: alice.id, to: 'bob', body: 'arrived between cycles', thread: 'cr-1' })

		const clock2 = fakeClock()
		const second = await awaitReply(
			{ store },
			{ meId: bob.id, thread: 'cr-1', timeoutMs: 600_000, maxWaitS: 2, now: clock2.now, sleep: clock2.sleep },
		)
		expect(second).toMatchObject({ kind: 'matched', message: { body: 'arrived between cycles' } })
	})
})
