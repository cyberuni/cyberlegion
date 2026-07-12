import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Exec } from '../identity.ts'
import { registerStanding, saveAgent } from '../identity.ts'
import { FileStore } from '../store/file-store.ts'
import type { AgentRecord } from '../store/store.ts'
import { DELIVERY_DOORBELL, wakeRecipient } from './doorbell.ts'
import type { SessionAdapter } from './session.ts'

// spec: mail/doorbell/doorbell.feature — one test per frozen scenario, unit-level with a fake
// SessionAdapter (mirrors console/nudge.test.ts's fakeAdapter: reads queue + send/submit spies).

let store: FileStore
beforeEach(() => {
	store = new FileStore(join(mkdtempSync(join(tmpdir(), 'cl-doorbell-')), 'hub'))
})

const exec: Exec = () => null
const STAGED = `> ${DELIVERY_DOORBELL.slice(0, 45)}`
const SCROLLED_OUT = [
	DELIVERY_DOORBELL,
	'peer response line 1',
	'peer response line 2',
	'peer response line 3',
	'peer response line 4',
	'peer response line 5',
	'peer response line 6',
	'> ',
].join('\n')

/** A fake adapter whose `read` returns queued values across successive calls (send/submit are spies). */
function fakeAdapter(reads: string[]): { adapter: SessionAdapter; sendCalls: string[]; submitCalls: number[] } {
	const sendCalls: string[] = []
	let submitCount = 0
	const submitCalls: number[] = []
	let readIndex = 0
	const adapter: SessionAdapter = {
		name: 'fake',
		open: () => {
			throw new Error('not used')
		},
		send: (_exec, _t, text) => {
			sendCalls.push(text)
		},
		submit: () => {
			submitCount++
			submitCalls.push(submitCount)
		},
		read: () => {
			const value = reads[Math.min(readIndex, reads.length - 1)] ?? ''
			readIndex++
			return value
		},
		focus: () => {},
		teardown: () => {},
		paneExists: () => true,
		listPanes: () => [],
	}
	return { adapter, sendCalls, submitCalls }
}

function peer(id: string, pane: string | null): AgentRecord {
	const rec: AgentRecord = {
		id,
		handle: id,
		harness: 'claude',
		cwd: '/repo',
		pane: pane ? { mux: 'tmux', id: pane } : null,
		status: 'active',
		createdAt: '2026-01-01T00:00:00.000Z',
		lastSeen: '2026-01-01T00:00:00.000Z',
	}
	saveAgent(store, rec)
	return rec
}

describe('spec:cyberlegion/mail/doorbell', () => {
	it('sending to a peer with a live session pane rings that pane on delivery', async () => {
		peer('bob', '%1')
		const { adapter, sendCalls } = fakeAdapter([SCROLLED_OUT])
		const result = await wakeRecipient(store, () => adapter, exec, { toId: 'bob', fromId: 'alice' })
		expect(result.rung).toBe(true)
		expect(result.pane).toBe('%1')
		expect(sendCalls).toEqual([DELIVERY_DOORBELL])
	})

	// one staged read then taken → one resubmit flushes the staged buffer (never a re-type).
	it('the delivery doorbell is delivered as a taken turn, not fire-and-forget', async () => {
		peer('bob', '%1')
		const { adapter, sendCalls, submitCalls } = fakeAdapter([STAGED, SCROLLED_OUT])
		const result = await wakeRecipient(
			store,
			() => adapter,
			exec,
			{ toId: 'bob', fromId: 'alice' },
			{ sleep: async () => {} },
		)
		expect(result.rung).toBe(true)
		expect(submitCalls.length).toBeGreaterThan(0)
		expect(sendCalls).toEqual([DELIVERY_DOORBELL]) // rang exactly once — nudge never re-types
	})

	it("sending does not ring the sender's own pane", async () => {
		peer('alice', '%1')
		const { adapter, sendCalls } = fakeAdapter([SCROLLED_OUT])
		const result = await wakeRecipient(store, () => adapter, exec, { toId: 'alice', fromId: 'alice' })
		expect(result.rung).toBe(false)
		expect(sendCalls).toEqual([])
	})

	it('a recipient with no live pane is a store-and-forward no-op, not a send failure', async () => {
		peer('bob', null)
		const { adapter, sendCalls } = fakeAdapter([SCROLLED_OUT])
		const result = await wakeRecipient(store, () => adapter, exec, { toId: 'bob', fromId: 'alice' })
		expect(result.rung).toBe(false)
		expect(sendCalls).toEqual([])
	})

	// The fake adapter keeps the doorbell staged forever, so nudge exhausts its retry cap and throws;
	// wakeRecipient swallows it into a warning and never fails the send. Fast via injected nudge opts
	// (the repo's injectable-sleep idiom) — no real timers.
	it('a delivery ring that never completes never fails the send', async () => {
		peer('bob', '%1')
		const { adapter } = fakeAdapter([STAGED])
		const result = await wakeRecipient(
			store,
			() => adapter,
			exec,
			{ toId: 'bob', fromId: 'alice' },
			{ attempts: 2, sleep: async () => {} },
		)
		expect(result.rung).toBe(false)
		expect(result.warning).toBeTruthy()
	})

	it('sending to the Bunker rings the bound main pane so the human is notified on arrival', async () => {
		registerStanding({ store, env: {}, now: () => 1_700_000_000_000 }, { handle: 'bunker' })
		store.setMainPane('%9')
		const { adapter, sendCalls } = fakeAdapter([SCROLLED_OUT])
		const result = await wakeRecipient(store, () => adapter, exec, { toId: 'standing-bunker', fromId: 'alice' })
		expect(result.rung).toBe(true)
		expect(result.pane).toBe('%9')
		expect(sendCalls).toEqual([DELIVERY_DOORBELL])
	})

	it('Bunker mail with no bound main pane is a store-and-forward no-op', async () => {
		registerStanding({ store, env: {}, now: () => 1_700_000_000_000 }, { handle: 'bunker' })
		const { adapter, sendCalls } = fakeAdapter([SCROLLED_OUT])
		const result = await wakeRecipient(store, () => adapter, exec, { toId: 'standing-bunker', fromId: 'alice' })
		expect(result.rung).toBe(false)
		expect(sendCalls).toEqual([])
	})

	it('--no-nudge suppresses the delivery doorbell to a peer', async () => {
		peer('bob', '%1')
		const { adapter, sendCalls } = fakeAdapter([SCROLLED_OUT])
		const result = await wakeRecipient(store, () => adapter, exec, { toId: 'bob', fromId: 'alice', noNudge: true })
		expect(result.rung).toBe(false)
		expect(sendCalls).toEqual([])
	})

	it('--no-nudge suppresses the Bunker doorbell to the bound main pane', async () => {
		registerStanding({ store, env: {}, now: () => 1_700_000_000_000 }, { handle: 'bunker' })
		store.setMainPane('%9')
		const { adapter, sendCalls } = fakeAdapter([SCROLLED_OUT])
		const result = await wakeRecipient(store, () => adapter, exec, {
			toId: 'standing-bunker',
			fromId: 'alice',
			noNudge: true,
		})
		expect(result.rung).toBe(false)
		expect(sendCalls).toEqual([])
	})
})
