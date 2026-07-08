import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { type AgentRecord, register, registerStanding, saveAgent } from '../identity.ts'
import { ack, send } from '../message.ts'
import { FileStore } from '../store/file-store.ts'
import { injectInbox } from './inject-inbox.ts'

let store: FileStore
let bob: AgentRecord
beforeEach(() => {
	store = new FileStore(join(mkdtempSync(join(tmpdir(), 'cl-')), 'hub'))
	const alice = register(
		{ store, env: { TMUX: 't', TMUX_PANE: '%1' }, exec: () => null },
		{ handle: 'alice', harness: 'claude' },
	)
	bob = register({ store, env: { TMUX: 't', TMUX_PANE: '%2' }, exec: () => null }, { handle: 'bob', harness: 'cursor' })
	send({ store, now: () => 1 }, { fromId: alice.id, to: 'bob', body: 'ping' })
})

const bobCtx = () => ({ store, env: { CYBERLEGION_AGENT_ID: bob.id } })

describe('mail hook emits the SessionStart payload', () => {
	it('emits additionalContext with unread mail', () => {
		const payload = injectInbox(bobCtx(), 'SessionStart')
		expect(payload?.hookSpecificOutput.hookEventName).toBe('SessionStart')
		expect(payload?.hookSpecificOutput.additionalContext).toContain('ping')
	})

	it('surfaces a spawned peer brief with no mail present', () => {
		// A fresh peer with a pending brief and an empty inbox — isolates the "and no mail" precondition.
		const peer = register(
			{ store, env: { TMUX: 't', TMUX_PANE: '%9' }, exec: () => null },
			{ handle: 'peer', harness: 'claude' },
		)
		saveAgent(store, { ...peer, status: 'spawning' })
		store.writeBrief(peer.id, 'do the migration')
		const payload = injectInbox({ store, env: { CYBERLEGION_AGENT_ID: peer.id } }, 'SessionStart')
		expect(payload?.hookSpecificOutput.additionalContext).toContain('do the migration')
		expect(payload?.hookSpecificOutput.additionalContext).not.toContain('Unread')
	})
})

describe('empty / error cases', () => {
	it('injects nothing when there is no unread mail and no brief', () => {
		const solo = register(
			{ store, env: { CYBERLEGION_AGENT_ID: 'lone', TMUX_PANE: '%9' }, exec: () => null },
			{ handle: 'lone', harness: 'claude' },
		)
		expect(injectInbox({ store, env: { CYBERLEGION_AGENT_ID: solo.id } }, 'SessionStart')).toBeNull()
	})

	it('injects nothing (no error) for an unregistered caller in no multiplexer pane', () => {
		expect(injectInbox({ store, env: {} }, 'SessionStart')).toBeNull()
	})

	it('auto-registers a live-pane session that has no identity yet, then injects nothing (empty inbox)', () => {
		// A fresh herdr pane, no identity, no unread mail, no brief, but a detectable harness.
		const env = { HERDR_ENV: '1', HERDR_PANE_ID: 'w5:p1', CLAUDECODE: '1' }
		const payload = injectInbox({ store, env, exec: () => null }, 'SessionStart')
		expect(payload).toBeNull() // nothing to inject → stdout empty, exit 0
		// but the session IS now registered and its pane resolves to a new agent id
		const newId = store.resolvePaneId('w5:p1')
		expect(newId).toBeDefined()
		expect(store.getAgent(newId!)?.pane).toEqual({ mux: 'herdr', id: 'w5:p1' })
	})

	it('auto-register is best-effort: an undetectable harness fails quietly — no register, no error, no output', () => {
		// A live pane but no harness signal at all → register throws → inject nothing, never fail the turn.
		const env = { HERDR_ENV: '1', HERDR_PANE_ID: 'w6:p1' }
		expect(injectInbox({ store, env, exec: () => null }, 'SessionStart')).toBeNull()
		expect(store.resolvePaneId('w6:p1')).toBeUndefined() // nothing was registered
	})

	it('rejects an unsupported --event', () => {
		expect(() => injectInbox(bobCtx(), 'Frobnicate')).toThrow(/unsupported/)
	})
})

describe('owner mail surfaces into a root session, never into a spawned unit', () => {
	it('a root session surfaces the standing owner unread mail with bodies under a distinct heading', () => {
		const homa = registerStanding({ store }, { handle: 'homa' })
		send({ store, now: () => 10 }, { fromId: bob.id, to: homa.id, body: 'status report' })
		const root = register(
			{ store, env: { TMUX: 't', TMUX_PANE: '%3' }, exec: () => null },
			{ handle: 'root', harness: 'claude' },
		)
		const payload = injectInbox({ store, env: { CYBERLEGION_AGENT_ID: root.id } }, 'SessionStart')
		const ctxStr = payload?.hookSpecificOutput.additionalContext ?? ''
		expect(ctxStr).toContain('Owner mail — homa')
		expect(ctxStr).toContain('status report')
		expect(ctxStr).not.toContain('## Unread mail')
	})

	it('a spawned unit (record has spawnedBy) surfaces no owner-mail section', () => {
		const homa = registerStanding({ store }, { handle: 'homa' })
		send({ store, now: () => 10 }, { fromId: bob.id, to: homa.id, body: 'status report' })
		const unit = register(
			{ store, env: { TMUX: 't', TMUX_PANE: '%4' }, exec: () => null },
			{ handle: 'unit', harness: 'claude' },
		)
		saveAgent(store, { ...unit, spawnedBy: 'someone' })
		const payload = injectInbox({ store, env: { CYBERLEGION_AGENT_ID: unit.id } }, 'SessionStart')
		expect(payload?.hookSpecificOutput.additionalContext ?? '').not.toContain('Owner mail')
	})

	it('surfacing the owner mail never acks it — it re-surfaces on a second call and stays unread', () => {
		const homa = registerStanding({ store }, { handle: 'homa' })
		send({ store, now: () => 10 }, { fromId: bob.id, to: homa.id, body: 'status report' })
		const root = register(
			{ store, env: { TMUX: 't', TMUX_PANE: '%5' }, exec: () => null },
			{ handle: 'root2', harness: 'claude' },
		)
		const rootCtx = { store, env: { CYBERLEGION_AGENT_ID: root.id } }
		const first = injectInbox(rootCtx, 'SessionStart')
		const second = injectInbox(rootCtx, 'SessionStart')
		expect(first?.hookSpecificOutput.additionalContext).toContain('status report')
		expect(second?.hookSpecificOutput.additionalContext).toContain('status report')
		expect(store.listInbox(homa.id).unread).toHaveLength(1)
	})

	it('an acked owner message no longer surfaces', () => {
		const homa = registerStanding({ store }, { handle: 'homa' })
		const msg = send({ store, now: () => 10 }, { fromId: bob.id, to: homa.id, body: 'status report' })
		ack({ store }, homa.id, msg.id)
		const root = register(
			{ store, env: { TMUX: 't', TMUX_PANE: '%6' }, exec: () => null },
			{ handle: 'root3', harness: 'claude' },
		)
		const payload = injectInbox({ store, env: { CYBERLEGION_AGENT_ID: root.id } }, 'SessionStart')
		expect(payload?.hookSpecificOutput.additionalContext ?? '').not.toContain('Owner mail')
	})

	it('a root session with no standing owner record surfaces no owner mail and does not error', () => {
		const root = register(
			{ store, env: { TMUX: 't', TMUX_PANE: '%7' }, exec: () => null },
			{ handle: 'root4', harness: 'claude' },
		)
		expect(injectInbox({ store, env: { CYBERLEGION_AGENT_ID: root.id } }, 'SessionStart')).toBeNull()
	})
})
