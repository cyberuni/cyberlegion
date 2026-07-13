import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Exec } from '../identity.ts'
import { registerStanding, saveAgent } from '../identity.ts'
import { FileStore } from '../store/file-store.ts'
import type { AgentRecord } from '../store/store.ts'
import { DELIVERY_DOORBELL, SPAWN_DOORBELL, wakeRecipient, wakeSpawn } from './doorbell.ts'
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

/**
 * A fake adapter whose `read` returns queued values across successive calls (send/submit are spies).
 * `isPaneFocused` returns `focused` verbatim — omit it for the unknown/fail-open path (rings), or pass
 * `true`/`false` to exercise the doorbell's focus gate. No default: an omitted arg is genuinely
 * `undefined` (unknown), so passing `undefined` explicitly reaches the same path rather than a default.
 */
function fakeAdapter(
	reads: string[],
	focused?: boolean,
): { adapter: SessionAdapter; sendCalls: string[]; submitCalls: number[] } {
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
		isPaneFocused: () => focused,
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

	it('sending to a standing owner rings the bound main pane so the human is notified on arrival', async () => {
		registerStanding({ store, env: {}, now: () => 1_700_000_000_000 }, { handle: 'owner' })
		store.setMainPane('%9')
		const { adapter, sendCalls } = fakeAdapter([SCROLLED_OUT])
		const result = await wakeRecipient(store, () => adapter, exec, { toId: 'standing-owner', fromId: 'alice' })
		expect(result.rung).toBe(true)
		expect(result.pane).toBe('%9')
		expect(sendCalls).toEqual([DELIVERY_DOORBELL])
	})

	it('standing-owner mail with no bound main pane is a store-and-forward no-op', async () => {
		registerStanding({ store, env: {}, now: () => 1_700_000_000_000 }, { handle: 'owner' })
		const { adapter, sendCalls } = fakeAdapter([SCROLLED_OUT])
		const result = await wakeRecipient(store, () => adapter, exec, { toId: 'standing-owner', fromId: 'alice' })
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

	it('a standing-owner delivery does not ring the bound main pane when it is positively not focused', async () => {
		registerStanding({ store, env: {}, now: () => 1_700_000_000_000 }, { handle: 'owner' })
		store.setMainPane('%9')
		const { adapter, sendCalls } = fakeAdapter([SCROLLED_OUT], false)
		const result = await wakeRecipient(store, () => adapter, exec, { toId: 'standing-owner', fromId: 'alice' })
		expect(result.rung).toBe(false)
		expect(result.pane).toBe('%9')
		expect(sendCalls).toEqual([])
	})

	it('a standing-owner delivery rings the bound main pane when it is focused', async () => {
		registerStanding({ store, env: {}, now: () => 1_700_000_000_000 }, { handle: 'owner' })
		store.setMainPane('%9')
		const { adapter, sendCalls } = fakeAdapter([SCROLLED_OUT], true)
		const result = await wakeRecipient(store, () => adapter, exec, { toId: 'standing-owner', fromId: 'alice' })
		expect(result.rung).toBe(true)
		expect(sendCalls).toEqual([DELIVERY_DOORBELL])
	})

	it('a standing-owner delivery rings when focus is unknown, and a probe error never fails the send', async () => {
		registerStanding({ store, env: {}, now: () => 1_700_000_000_000 }, { handle: 'owner' })
		store.setMainPane('%9')
		const { adapter, sendCalls } = fakeAdapter([SCROLLED_OUT], undefined)
		const result = await wakeRecipient(store, () => adapter, exec, { toId: 'standing-owner', fromId: 'alice' })
		expect(result.rung).toBe(true)
		expect(sendCalls).toEqual([DELIVERY_DOORBELL])
	})

	it('a standing-owner delivery rings when the focus probe throws', async () => {
		registerStanding({ store, env: {}, now: () => 1_700_000_000_000 }, { handle: 'owner' })
		store.setMainPane('%9')
		const { adapter, sendCalls } = fakeAdapter([SCROLLED_OUT], true)
		adapter.isPaneFocused = () => {
			throw new Error('no mux backend')
		}
		const result = await wakeRecipient(store, () => adapter, exec, { toId: 'standing-owner', fromId: 'alice' })
		expect(result.rung).toBe(true)
		expect(sendCalls).toEqual([DELIVERY_DOORBELL])
	})

	it('a peer delivery ring is never focus-gated', async () => {
		peer('bob', '%1')
		const { adapter, sendCalls } = fakeAdapter([SCROLLED_OUT], false)
		const result = await wakeRecipient(store, () => adapter, exec, { toId: 'bob', fromId: 'alice' })
		expect(result.rung).toBe(true)
		expect(sendCalls).toEqual([DELIVERY_DOORBELL])
	})

	it("--no-nudge suppresses the doorbell to a standing owner's bound main pane", async () => {
		registerStanding({ store, env: {}, now: () => 1_700_000_000_000 }, { handle: 'owner' })
		store.setMainPane('%9')
		const { adapter, sendCalls } = fakeAdapter([SCROLLED_OUT])
		const result = await wakeRecipient(store, () => adapter, exec, {
			toId: 'standing-owner',
			fromId: 'alice',
			noNudge: true,
		})
		expect(result.rung).toBe(false)
		expect(sendCalls).toEqual([])
	})
})

// spec: unit/lifecycle/lifecycle.feature — spawn delivers the peer's first turn. wakeSpawn is the
// best-effort first-turn ring the `unit spawn` command runs against the freshly-opened pane, the
// spawn-side counterpart to wakeRecipient. Same fake-adapter harness; fast via injected nudge opts.
const SPAWN_STAGED = `> ${SPAWN_DOORBELL.slice(0, 45)}`
const SPAWN_SCROLLED_OUT = [SPAWN_DOORBELL, 'boot line 1', 'boot line 2', 'boot line 3', 'boot line 4', '> '].join('\n')

describe('spec:cyberlegion/unit/lifecycle spawn first-turn', () => {
	it('spawn delivers a first turn to the freshly-opened pane so the peer acts on its brief', async () => {
		const { adapter, sendCalls } = fakeAdapter([SPAWN_SCROLLED_OUT])
		const result = await wakeSpawn(() => adapter, exec, { target: { id: '%1' } }, { sleep: async () => {} })
		expect(result.rung).toBe(true)
		expect(result.pane).toBe('%1')
		// the doorbell wakes the peer to act on its loaded brief; the brief itself is never re-typed here
		expect(sendCalls).toEqual([SPAWN_DOORBELL])
	})

	it('the first turn is delivered as a taken turn, robust to the harness boot race', async () => {
		const { adapter, sendCalls, submitCalls } = fakeAdapter([SPAWN_STAGED, SPAWN_SCROLLED_OUT])
		const result = await wakeSpawn(() => adapter, exec, { target: { id: '%1' } }, { sleep: async () => {} })
		expect(result.rung).toBe(true)
		expect(submitCalls.length).toBeGreaterThan(0) // flushed the staged buffer
		expect(sendCalls).toEqual([SPAWN_DOORBELL]) // delivered exactly once — nudge never re-types
	})

	it('a first-turn ring that never completes never fails the spawn', async () => {
		const { adapter } = fakeAdapter([SPAWN_STAGED]) // stays staged forever → nudge exhausts its cap
		const result = await wakeSpawn(
			() => adapter,
			exec,
			{ target: { id: '%1' } },
			{ attempts: 2, sleep: async () => {} },
		)
		expect(result.rung).toBe(false)
		expect(result.pane).toBe('%1')
		expect(result.warning).toBeTruthy() // best-effort warning, never a thrown spawn error
	})

	it('a first-turn ring degrades to a warned no-op when the backend adapter has gone away', async () => {
		const result = await wakeSpawn(
			() => {
				throw new Error('no mux backend')
			},
			exec,
			{ target: { id: '%1' } },
			{ sleep: async () => {} },
		)
		expect(result.rung).toBe(false)
		expect(result.warning).toBeTruthy()
	})

	it('--no-wake spawns without delivering the first turn', async () => {
		const { adapter, sendCalls } = fakeAdapter([SPAWN_SCROLLED_OUT])
		const result = await wakeSpawn(
			() => adapter,
			exec,
			{ target: { id: '%1' }, noWake: true },
			{ sleep: async () => {} },
		)
		expect(result.rung).toBe(false)
		expect(sendCalls).toEqual([]) // nothing rung
	})
})
