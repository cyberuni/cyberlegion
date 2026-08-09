import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { type AgentRecord, loadAgent, register, registerStanding, saveAgent } from '../identity.ts'
import { ack, inbox, type Message, send } from '../message.ts'
import { FileStore } from '../store/file-store.ts'
import { injectInbox } from './inject-inbox.ts'

let store: FileStore
let bob: AgentRecord
/** alice's subject-less "ping" to bob — the one message every fixture here starts with. */
let ping: Message
beforeEach(() => {
	store = new FileStore(join(mkdtempSync(join(tmpdir(), 'cl-')), 'hub'))
	const alice = register(
		{ store, env: { TMUX: 't', TMUX_PANE: '%1' }, exec: () => null },
		{ handle: 'alice', harness: 'claude' },
	)
	bob = register({ store, env: { TMUX: 't', TMUX_PANE: '%2' }, exec: () => null }, { handle: 'bob', harness: 'cursor' })
	ping = send({ store, now: () => 1 }, { fromId: alice.id, to: 'bob', body: 'ping' })
})

/** The one payload line carrying `id` — the unit the frozen Then talks about ("each message line
 * names its sender, its body, and its message id"). */
function lineOf(text: string, id: string): string {
	return text.split('\n').find((l) => l.includes(id)) ?? ''
}

const bobCtx = () => ({ store, env: { CYBERLEGION_AGENT_ID: bob.id } })

/** A brief body distinctive enough that its absence from a payload is a real assertion. */
const BRIEF_BODY = 'do the migration'

/**
 * The one `## `-headed section whose heading contains `heading`, up to the next `## ` heading.
 * Order-free: sections are located by their own heading rather than by position, so a test never
 * silently depends on the registry's enumeration order.
 */
function sectionOf(text: string, heading: string): string {
	const sections = text.split(/^## /m).slice(1)
	return sections.find((s) => s.startsWith(heading)) ?? ''
}

describe('mail hook emits the SessionStart payload', () => {
	it('emits additionalContext with unread mail', () => {
		const payload = injectInbox(bobCtx(), 'SessionStart')
		expect(payload?.hookSpecificOutput.hookEventName).toBe('SessionStart')
		expect(payload?.hookSpecificOutput.additionalContext).toContain('ping')
	})

	it('lists every unread message under a counted heading with sender, subject, body, and id', () => {
		// Two messages from DISTINCT senders so the sender is discriminating rather than incidental,
		// and a subject on one so the subject field is exercised at all. Each named field is asserted
		// separately: a payload carrying only bodies satisfies "unread mail is included" while losing
		// everything a reader needs to act on or ack it.
		const carol = register(
			{ store, env: { TMUX: 't', TMUX_PANE: '%7' }, exec: () => null },
			{ handle: 'carol', harness: 'claude' },
		)
		const deploy = send({ store, now: () => 2 }, { fromId: carol.id, to: 'bob', subject: 'deploy', body: 'ship it' })

		const ctxText = injectInbox(bobCtx(), 'SessionStart')?.hookSpecificOutput.additionalContext ?? ''
		expect(ctxText).toContain('## Unread mail (2)') // the count, not just the heading
		for (const m of inbox({ store }, { meId: bob.id, unread: true })) {
			expect(ctxText).toContain(m.id) // every id, so each message is ackable from the payload
		}
		// Asserted PER LINE, not payload-wide: the frozen Then binds each field to ITS OWN message's
		// line, and a payload-wide `toContain` is satisfied by a renderer that hoisted carol's subject
		// onto alice's line — the reader would then ack the wrong message, or act on the wrong brief.
		const pingLine = lineOf(ctxText, ping.id)
		expect(pingLine).toContain('alice')
		expect(pingLine).toContain('ping')
		const deployLine = lineOf(ctxText, deploy.id)
		expect(deployLine).toContain('carol')
		expect(deployLine).toContain('ship it')
		expect(deployLine).toContain('deploy') // the subject sits on the subject-carrying message's line
		// ...and only there. Without this, one line carrying BOTH subjects still satisfies every
		// clause above.
		expect(pingLine).not.toContain('deploy')
		expect(deployLine).not.toContain('alice')
	})

	it('echoes PostToolUse as the hook event name on a PostToolUse call', () => {
		// The event is ECHOED, not hardcoded: an implementation that always wrote 'SessionStart' passes
		// every SessionStart assertion in this file, and the harness then discards the injection.
		const payload = injectInbox(bobCtx(), 'PostToolUse')
		expect(payload?.hookSpecificOutput.hookEventName).toBe('PostToolUse')
		expect(payload?.hookSpecificOutput.additionalContext).toContain('ping')
	})

	it('renders a message with no subject with the body straight after the sender', () => {
		// alice's message carries no subject. The em-dash subject segment must be ABSENT, not empty:
		// a naive `— ${m.subject}` renders "— undefined" (or a dangling dash) and still contains the
		// sender and the body, so a contains-only assertion cannot see it.
		const ctxText = injectInbox(bobCtx(), 'SessionStart')?.hookSpecificOutput.additionalContext ?? ''
		const line = ctxText.split('\n').find((l) => l.includes('ping')) ?? ''
		expect(line).toMatch(/^- \*\*alice\*\*: ping /)
		expect(line).not.toContain('—')
		expect(line).not.toContain('undefined')
		// ...under a heading that counts ONE. bob has exactly one unread message here, and n=1 is the
		// count the rest of this file never reaches — every other case is 2 or 0, so a heading that
		// only formats a count correctly above one survives them all.
		expect(ctxText).toContain('## Unread mail (1)')
	})

	it('counts a single unread message as (1) in the heading', () => {
		// The frozen arrangement: TWO messages addressed to the caller, one of them acked, so the
		// heading must read (1) — an implementation that counted the inbox rather than its unread half
		// says (2) here, and one that mis-renders the singular says something else again.
		const acked = send({ store, now: () => 2 }, { fromId: bob.id, to: 'bob', body: 'already handled' })
		ack({ store }, bob.id, acked.id)
		const ctxText = injectInbox(bobCtx(), 'SessionStart')?.hookSpecificOutput.additionalContext ?? ''
		expect(ctxText).toContain('## Unread mail (1)')
		expect(ctxText).toContain('ping') // the still-unread one is listed...
		expect(ctxText).not.toContain('already handled') // ...and the acked one is not
	})

	it("an acked message of the caller's own no longer surfaces", () => {
		const kept = send({ store, now: () => 2 }, { fromId: bob.id, to: 'bob', body: 'still unread' })
		const acked = send({ store, now: () => 3 }, { fromId: bob.id, to: 'bob', body: 'already handled' })
		ack({ store }, bob.id, acked.id)
		const ctxText = injectInbox(bobCtx(), 'SessionStart')?.hookSpecificOutput.additionalContext ?? ''
		// Two of the three messages remain unread (alice's 'ping' plus `kept`), so the count is a real
		// discriminator: an implementation ignoring the unread filter would say (3) and list the acked one.
		expect(ctxText).toContain('## Unread mail (2)')
		expect(ctxText).toContain('still unread')
		expect(ctxText).toContain(kept.id)
		expect(ctxText).not.toContain('already handled')
		expect(ctxText).not.toContain(acked.id)
	})

	it("surfacing the caller's own mail never acks it", () => {
		const first = injectInbox(bobCtx(), 'SessionStart')?.hookSpecificOutput.additionalContext ?? ''
		const second = injectInbox(bobCtx(), 'SessionStart')?.hookSpecificOutput.additionalContext ?? ''
		expect(first).toContain('ping')
		expect(second).toContain('ping') // still surfaced on the second call — not consumed by the first
		expect(store.listInbox(bob.id).unread).toHaveLength(1)
		expect(store.listInbox(bob.id).read).toHaveLength(0)
	})

	it('a caller whose id resolves without an agent record still gets its own mail', () => {
		// The inbox is keyed by id, the owner-mail and nudge gates are keyed by the RECORD. A caller
		// whose record was reaped while its inbox survived must still be told what is in that inbox,
		// and must get neither an owner section nor a nudge (both need a record to gate on).
		const homa = registerStanding({ store }, { handle: 'homa' })
		send({ store, now: () => 10 }, { fromId: bob.id, to: homa.id, body: 'owner report' })
		const orphan = register(
			{ store, env: { TMUX: 't', TMUX_PANE: '%40' }, exec: () => null },
			{ handle: 'orphan', harness: 'claude' },
		)
		send({ store, now: () => 11 }, { fromId: bob.id, to: orphan.id, body: 'orphaned message' })
		store.removeAgent(orphan.id) // record gone, inbox kept — and no main pane is bound
		expect(loadAgent(store, orphan.id)).toBeUndefined()

		// The session runs IN ITS PANE, as the frozen Given puts it. Driving this unpaned instead
		// suppressed the setup nudge through an unrelated arm — the non-mux branch needs a standing
		// owner to be missing, and `homa` exists — so "no Legion setup" held for every implementation,
		// including one whose record gate had been dropped. In a pane with no main pane bound, a
		// RECORDED root session gets both sections, so both absences are now discriminating.
		const orphanEnv = { TMUX: 't', TMUX_PANE: '%40', CYBERLEGION_AGENT_ID: orphan.id }
		const ctxText =
			injectInbox({ store, env: orphanEnv, exec: () => null }, 'SessionStart')?.hookSpecificOutput.additionalContext ??
			''
		expect(ctxText).toContain('orphaned message')
		expect(ctxText).not.toContain('Owner mail')
		expect(ctxText).not.toContain('Legion setup')
	})

	it("a spawned peer's hook call injects no brief", () => {
		// A spawned peer whose brief file is on disk, with one unread message so the payload is
		// non-empty — the suppression must hold inside a real payload, not vacuously against no output.
		const peer = register(
			{ store, env: { TMUX: 't', TMUX_PANE: '%9' }, exec: () => null },
			{ handle: 'peer', harness: 'claude' },
		)
		// a spawned peer's record points at its brief file — `spawn` always writes this field, and an
		// injection branch would far more naturally key on it than on a status
		saveAgent(store, { ...peer, spawnedBy: bob.id, brief: join(store.root, 'data', peer.id, 'brief.md') })
		store.writeBrief(peer.id, BRIEF_BODY)
		send({ store, now: () => 2 }, { fromId: bob.id, to: 'peer', body: 'ping peer' })

		const payload = injectInbox({ store, env: { CYBERLEGION_AGENT_ID: peer.id } }, 'SessionStart')
		const ctxText = payload?.hookSpecificOutput.additionalContext ?? ''
		expect(ctxText).toContain('ping peer')
		expect(ctxText).not.toContain(BRIEF_BODY)
		expect(ctxText).not.toContain('Your brief')
		// the brief file is left for the peer to read at the path the spawn wake named
		expect(store.readBrief(peer.id)).toBe(BRIEF_BODY)
	})

	it('a peer record carrying a legacy spawning status still gets no brief', () => {
		// `admin migrate` carries records from an older hub, so a `spawning` status is still reachable
		// even though this version never writes one. The hook must not inject on it, and must not flip
		// it — the status is preserved verbatim.
		const peer = register(
			{ store, env: { TMUX: 't', TMUX_PANE: '%8' }, exec: () => null },
			{ handle: 'legacy', harness: 'claude' },
		)
		saveAgent(store, {
			...peer,
			status: 'spawning',
			spawnedBy: bob.id,
			brief: join(store.root, 'data', peer.id, 'brief.md'),
		})
		store.writeBrief(peer.id, BRIEF_BODY)
		send({ store, now: () => 3 }, { fromId: bob.id, to: 'legacy', body: 'ping legacy' })

		const payload = injectInbox({ store, env: { CYBERLEGION_AGENT_ID: peer.id } }, 'SessionStart')
		const ctxText = payload?.hookSpecificOutput.additionalContext ?? ''
		expect(ctxText).toContain('ping legacy')
		expect(ctxText).not.toContain(BRIEF_BODY)
		expect(ctxText).not.toContain('Your brief')
		// the migrated status is kept, not normalized to `active`
		expect(loadAgent(store, peer.id)?.status).toBe('spawning')
	})
})

describe('empty / error cases', () => {
	it('injects nothing for an empty inbox once onboarding is complete', () => {
		// The scenario's own preconditions: the caller sits in the bound main pane (so the mux nudge is
		// silenced) and the standing owner has nothing unread (so no owner section accumulates). With
		// its own inbox empty too, nothing accumulates at all.
		registerStanding({ store }, { handle: 'somebody' })
		register({ store, env: { TMUX: 't', TMUX_PANE: '%9' }, exec: () => null }, { handle: 'lone', harness: 'claude' })
		store.setMainPane('%9')
		expect(injectInbox({ store, env: { TMUX: 't', TMUX_PANE: '%9' }, exec: () => null }, 'SessionStart')).toBeNull()
	})

	it('injects nothing (no error) for an unregistered caller in no multiplexer pane', () => {
		// The environment carries the claude harness signal, so `register` COULD succeed here. With a
		// bare `env: {}` the harness is undetectable, `register` throws inside its own catch, and the
		// load-bearing assertion below — that the registry is unchanged — passes however the gate is
		// written: an implementation that auto-registered every unpaned caller would still leave the
		// registry empty. The signal is what makes "no pane ⇒ no registration" falsifiable.
		const before = store.listAgents().map((a) => a.id)
		expect(injectInbox({ store, env: { CLAUDECODE: '1' }, exec: () => null }, 'SessionStart')).toBeNull()
		expect(store.listAgents().map((a) => a.id)).toEqual(before)
	})

	it('a live pane in a multiplexer the hub cannot address registers no reachable identity', () => {
		// wezterm carries a pane, but `AgentRecord.pane` can only hold tmux/herdr, so no pane→id
		// binding is written and the pane resolves to no agent id. The harness IS detectable, so a
		// register that did bind the pane would be visible here.
		const env = { CYBER_MUX: 'wezterm', CYBER_MUX_PANE: 'wez-7', CLAUDECODE: '1' }
		expect(injectInbox({ store, env, exec: () => null }, 'SessionStart')).toBeNull()
		expect(store.resolvePaneId('wez-7')).toBeUndefined()
	})

	it('auto-registers a live-pane session that has no identity yet, then injects nothing (empty inbox)', () => {
		// A fresh herdr pane, no identity, but a detectable harness. The scenario's own precondition
		// binds this pane as the hub main pane; a fresh id also starts with an empty inbox, so nothing
		// accumulates and the load-bearing observation is the registry write.
		store.setMainPane('w5:p1')
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
		// it names BOTH supported events — an error that only says "unsupported" leaves the caller
		// guessing which values are legal
		expect(() => injectInbox(bobCtx(), 'Frobnicate')).toThrow(/unsupported/)
		expect(() => injectInbox(bobCtx(), 'Frobnicate')).toThrow(/SessionStart/)
		expect(() => injectInbox(bobCtx(), 'Frobnicate')).toThrow(/PostToolUse/)
		// ...and no payload comes back. `bob` HAS unread mail, so a validation placed after assembly
		// would have produced one — the refusal is what suppresses it, not an empty inbox.
		expect(injectInbox(bobCtx(), 'SessionStart')?.hookSpecificOutput.additionalContext).toContain('ping')
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
		// mail of its OWN, so the missing owner section is a real absence inside a real payload rather
		// than a payload that was never emitted at all
		send({ store, now: () => 11 }, { fromId: bob.id, to: unit.id, body: 'unit own message' })
		const payload = injectInbox({ store, env: { CYBERLEGION_AGENT_ID: unit.id } }, 'SessionStart')
		const ctxStr = payload?.hookSpecificOutput.additionalContext ?? ''
		expect(ctxStr).toContain('unit own message')
		expect(ctxStr).not.toContain('Owner mail')
	})

	it('every standing owner with unread mail gets its own heading', () => {
		const homa = registerStanding({ store }, { handle: 'homa' })
		const iris = registerStanding({ store }, { handle: 'iris' })
		send({ store, now: () => 10 }, { fromId: bob.id, to: homa.id, body: 'homa report' })
		send({ store, now: () => 11 }, { fromId: bob.id, to: iris.id, body: 'iris report' })
		const root = register(
			{ store, env: { TMUX: 't', TMUX_PANE: '%41' }, exec: () => null },
			{ handle: 'root-multi', harness: 'claude' },
		)
		const ctxStr =
			injectInbox({ store, env: { CYBERLEGION_AGENT_ID: root.id } }, 'SessionStart')?.hookSpecificOutput
				.additionalContext ?? ''
		// TWO owners, each with its own heading carrying its own message — an implementation that
		// surfaced only the first standing record, or folded both owners' mail under one heading,
		// satisfies every single-owner assertion in this file.
		expect(ctxStr).toContain('## Owner mail — homa (1)')
		expect(ctxStr).toContain('## Owner mail — iris (1)')
		// ...and each report sits under ITS OWN heading — order-free, since the registry does not
		// promise an enumeration order.
		expect(sectionOf(ctxStr, 'Owner mail — homa')).toContain('homa report')
		expect(sectionOf(ctxStr, 'Owner mail — homa')).not.toContain('iris report')
		expect(sectionOf(ctxStr, 'Owner mail — iris')).toContain('iris report')
		expect(sectionOf(ctxStr, 'Owner mail — iris')).not.toContain('homa report')
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
		// own mail, so the absent owner section is asserted inside a payload that exists
		send({ store, now: () => 11 }, { fromId: bob.id, to: root.id, body: 'root3 own message' })
		const ctxStr =
			injectInbox({ store, env: { CYBERLEGION_AGENT_ID: root.id } }, 'SessionStart')?.hookSpecificOutput
				.additionalContext ?? ''
		expect(ctxStr).toContain('root3 own message')
		expect(ctxStr).not.toContain('Owner mail')
	})

	it('a root session with no standing owner record surfaces no owner mail and does not error', () => {
		const root = register(
			{ store, env: { TMUX: 't', TMUX_PANE: '%7' }, exec: () => null },
			{ handle: 'root4', harness: 'claude' },
		)
		// The caller has unread mail of its OWN, so the absent owner section is a real assertion: a
		// payload that emits nothing at all would satisfy "no Owner mail" vacuously.
		send({ store, now: () => 12 }, { fromId: bob.id, to: root.id, body: 'my own message' })
		const payload = injectInbox({ store, env: { CYBERLEGION_AGENT_ID: root.id } }, 'SessionStart')
		const ctxStr = payload?.hookSpecificOutput.additionalContext ?? ''
		expect(ctxStr).toContain('my own message')
		expect(ctxStr).not.toContain('Owner mail')
	})
})

describe('owner mail gates on the bound main pane', () => {
	it('the bound main pane surfaces the owner unread mail under a distinct heading', () => {
		const homa = registerStanding({ store }, { handle: 'homa' })
		send({ store, now: () => 10 }, { fromId: bob.id, to: homa.id, body: 'status report' })
		const root = register(
			{ store, env: { TMUX: 't', TMUX_PANE: '%20' }, exec: () => null },
			{ handle: 'root', harness: 'claude' },
		)
		// the caller has unread mail of its OWN, so "distinct from the caller's own section" is a real
		// assertion — against a caller with an empty inbox it holds vacuously, and a payload that
		// folded both into one heading would pass
		send({ store, now: () => 11 }, { fromId: bob.id, to: root.id, body: 'my own message' })
		store.setMainPane('%20')
		const payload = injectInbox({ store, env: { TMUX: 't', TMUX_PANE: '%20' }, exec: () => null }, 'SessionStart')
		const ctxStr = payload?.hookSpecificOutput.additionalContext ?? ''
		expect(ctxStr).toContain('Owner mail — homa')
		expect(ctxStr).toContain('status report')
		// both sections present, under separate headings, each carrying its own message
		expect(ctxStr).toMatch(/^## Unread mail/m)
		expect(ctxStr).toContain('my own message')
		expect(ctxStr.indexOf('my own message')).toBeLessThan(ctxStr.indexOf('Owner mail — homa'))
		expect(ctxStr.slice(ctxStr.indexOf('Owner mail — homa'))).not.toContain('my own message')
	})

	it('a root session that is not the bound main pane does not surface owner mail', () => {
		const homa = registerStanding({ store }, { handle: 'homa' })
		send({ store, now: () => 10 }, { fromId: bob.id, to: homa.id, body: 'status report' })
		register({ store, env: { TMUX: 't', TMUX_PANE: '%20' }, exec: () => null }, { handle: 'root', harness: 'claude' })
		const second = register(
			{ store, env: { TMUX: 't', TMUX_PANE: '%21' }, exec: () => null },
			{ handle: 'root2', harness: 'claude' },
		)
		send({ store, now: () => 11 }, { fromId: bob.id, to: second.id, body: 'second own message' })
		store.setMainPane('%20')
		const ctxStr =
			injectInbox({ store, env: { TMUX: 't', TMUX_PANE: '%21' }, exec: () => null }, 'SessionStart')?.hookSpecificOutput
				.additionalContext ?? ''
		expect(ctxStr).toContain('second own message')
		expect(ctxStr).not.toContain('Owner mail')
	})

	it('a root session in no multiplexer pane surfaces no owner mail once a main pane is bound', () => {
		// The gate is `cur?.pane === bound`. An implementation reading it as "not positively a
		// different pane" would surface owner mail into every non-mux session the moment a main pane
		// was bound — the exact leak this scenario forbids, invisible to the in-pane cases above.
		const homa = registerStanding({ store }, { handle: 'homa' })
		send({ store, now: () => 10 }, { fromId: bob.id, to: homa.id, body: 'status report' })
		const root = register({ store, env: { CYBERLEGION_AGENT_ID: 'nonmux-bound' } }, { handle: 'nm', harness: 'claude' })
		send({ store, now: () => 11 }, { fromId: bob.id, to: root.id, body: 'nonmux own message' })
		store.setMainPane('%77')
		const ctxStr =
			injectInbox({ store, env: { CYBERLEGION_AGENT_ID: root.id } }, 'SessionStart')?.hookSpecificOutput
				.additionalContext ?? ''
		expect(ctxStr).toContain('nonmux own message')
		expect(ctxStr).not.toContain('Owner mail')
	})

	it('with no main pane bound, any root session still surfaces owner mail (fallback)', () => {
		const homa = registerStanding({ store }, { handle: 'homa' })
		send({ store, now: () => 10 }, { fromId: bob.id, to: homa.id, body: 'status report' })
		register({ store, env: { TMUX: 't', TMUX_PANE: '%22' }, exec: () => null }, { handle: 'root3', harness: 'claude' })
		const payload = injectInbox({ store, env: { TMUX: 't', TMUX_PANE: '%22' }, exec: () => null }, 'SessionStart')
		expect(payload?.hookSpecificOutput.additionalContext ?? '').toContain('Owner mail — homa')
	})
})

describe('the session-start Legion setup nudge', () => {
	it('an unbound root pane gets a Legion setup nudge pointing at cyberlegion init', () => {
		register({ store, env: { TMUX: 't', TMUX_PANE: '%30' }, exec: () => null }, { handle: 'root', harness: 'claude' })
		const payload = injectInbox({ store, env: { TMUX: 't', TMUX_PANE: '%30' }, exec: () => null }, 'SessionStart')
		const ctxStr = payload?.hookSpecificOutput.additionalContext ?? ''
		expect(ctxStr).toContain('Legion setup')
		expect(ctxStr).toContain('cyberlegion init')
	})

	it('an unbound root pane surfaces owner mail and the setup nudge with no unread-mail section', () => {
		const homa = registerStanding({ store }, { handle: 'homa' })
		send({ store, now: () => 10 }, { fromId: bob.id, to: homa.id, body: 'status report' })
		const root = register(
			{ store, env: { TMUX: 't', TMUX_PANE: '%31' }, exec: () => null },
			{ handle: 'root', harness: 'claude' },
		)
		// every message addressed to this session has been acked — so its own section is absent
		const mine = send({ store, now: () => 11 }, { fromId: bob.id, to: root.id, body: 'already handled' })
		ack({ store }, root.id, mine.id)
		const payload = injectInbox({ store, env: { TMUX: 't', TMUX_PANE: '%31' }, exec: () => null }, 'SessionStart')
		const ctxStr = payload?.hookSpecificOutput.additionalContext ?? ''
		expect(ctxStr).toContain('Owner mail — homa')
		expect(ctxStr).toContain('status report')
		expect(ctxStr).toContain('Legion setup')
		expect(ctxStr).toContain('cyberlegion init')
		// the caller's OWN section is omitted entirely rather than emitted empty — an "Unread mail (0)"
		// heading would satisfy every other clause here
		expect(ctxStr).not.toContain('Unread mail')
		expect(ctxStr).not.toContain('already handled')
	})

	it('own mail, owner mail and the setup nudge appear in one payload, in that order', () => {
		const iris = registerStanding({ store }, { handle: 'iris' })
		send({ store, now: () => 10 }, { fromId: bob.id, to: iris.id, body: 'iris report' })
		const root = register(
			{ store, env: { TMUX: 't', TMUX_PANE: '%35' }, exec: () => null },
			{ handle: 'root-order', harness: 'claude' },
		)
		send({ store, now: () => 11 }, { fromId: bob.id, to: root.id, body: 'my own message' })
		const ctxStr =
			injectInbox({ store, env: { TMUX: 't', TMUX_PANE: '%35' }, exec: () => null }, 'SessionStart')?.hookSpecificOutput
				.additionalContext ?? ''
		const own = ctxStr.indexOf('## Unread mail')
		const owner = ctxStr.indexOf('## Owner mail — iris')
		const setup = ctxStr.indexOf('## Legion setup')
		// all three present...
		expect(own).toBeGreaterThanOrEqual(0)
		expect(owner).toBeGreaterThanOrEqual(0)
		expect(setup).toBeGreaterThanOrEqual(0)
		// ...in that order — the ordering is what makes the reader's own mail the first thing it sees
		expect(own).toBeLessThan(owner)
		expect(owner).toBeLessThan(setup)
		// ...and each pair is separated by a blank line, so the sections do not run together into one
		// paragraph the model reads as a single item
		expect(ctxStr).toContain('\n\n## Owner mail — iris')
		expect(ctxStr).toContain('\n\n## Legion setup')
	})

	it('binding a main pane silences the nudge', () => {
		const root = register(
			{ store, env: { TMUX: 't', TMUX_PANE: '%32' }, exec: () => null },
			{ handle: 'root', harness: 'claude' },
		)
		send({ store, now: () => 11 }, { fromId: bob.id, to: root.id, body: 'bound own message' })
		store.setMainPane('%32')
		const ctxStr =
			injectInbox({ store, env: { TMUX: 't', TMUX_PANE: '%32' }, exec: () => null }, 'SessionStart')?.hookSpecificOutput
				.additionalContext ?? ''
		expect(ctxStr).toContain('bound own message')
		expect(ctxStr).not.toContain('Legion setup')
	})

	it('a spawned unit never gets the setup nudge', () => {
		const unit = register(
			{ store, env: { TMUX: 't', TMUX_PANE: '%33' }, exec: () => null },
			{ handle: 'unit', harness: 'claude' },
		)
		saveAgent(store, { ...unit, spawnedBy: 'someone' })
		send({ store, now: () => 11 }, { fromId: bob.id, to: unit.id, body: 'spawned own message' })
		const ctxStr =
			injectInbox({ store, env: { TMUX: 't', TMUX_PANE: '%33' }, exec: () => null }, 'SessionStart')?.hookSpecificOutput
				.additionalContext ?? ''
		// no main pane is bound, so an unspawned root session in this same pane WOULD be nudged
		expect(ctxStr).toContain('spawned own message')
		expect(ctxStr).not.toContain('Legion setup')
	})

	it('a non-multiplexer root session with no standing owner gets the setup nudge', () => {
		register({ store, env: { CYBERLEGION_AGENT_ID: 'nonmux1' } }, { handle: 'nonmux', harness: 'claude' })
		const payload = injectInbox({ store, env: { CYBERLEGION_AGENT_ID: 'nonmux1' } }, 'SessionStart')
		expect(payload?.hookSpecificOutput.additionalContext ?? '').toContain('Legion setup')
	})

	it('a non-multiplexer root session that already has a standing owner gets no nudge', () => {
		// the owner exists but has nothing unread, so no owner section accumulates either — the
		// caller's own message is what keeps the payload non-empty, so "no nudge" is a real absence
		const homa = registerStanding({ store }, { handle: 'homa2' })
		const acked = send({ store, now: () => 10 }, { fromId: bob.id, to: homa.id, body: 'owner report' })
		ack({ store }, homa.id, acked.id)
		register({ store, env: { CYBERLEGION_AGENT_ID: 'nonmux2' } }, { handle: 'nonmux', harness: 'claude' })
		send({ store, now: () => 11 }, { fromId: bob.id, to: 'nonmux2', body: 'nonmux own message' })
		const ctxStr =
			injectInbox({ store, env: { CYBERLEGION_AGENT_ID: 'nonmux2' } }, 'SessionStart')?.hookSpecificOutput
				.additionalContext ?? ''
		expect(ctxStr).toContain('nonmux own message')
		expect(ctxStr).not.toContain('Legion setup')
	})

	/** `store` with one method replaced by a thrower — the hub-read failures the hook must absorb. */
	function storeThrowingOn(method: 'getMainPane' | 'listAgents'): FileStore {
		return new Proxy(store, {
			get(target, prop, receiver) {
				if (prop === method) {
					return () => {
						throw new Error('boom')
					}
				}
				return Reflect.get(target, prop, receiver)
			},
		}) as FileStore
	}

	it("a failing main-pane lookup drops the owner-mail section but keeps the caller's own mail", () => {
		const homa = registerStanding({ store }, { handle: 'homa' })
		send({ store, now: () => 10 }, { fromId: bob.id, to: homa.id, body: 'status report' })
		register({ store, env: { CYBERLEGION_AGENT_ID: 'thrower1' } }, { handle: 'thrower', harness: 'claude' })
		send({ store, now: () => 11 }, { fromId: bob.id, to: 'thrower1', body: 'thrower own message' })
		const env = { CYBERLEGION_AGENT_ID: 'thrower1' }
		// The absorbing catch must not swallow the caller's own mail with it: a try/catch wrapped
		// around the WHOLE assembly would return null here and the turn would still not fail.
		const ctxStr =
			injectInbox({ store: storeThrowingOn('getMainPane'), env }, 'SessionStart')?.hookSpecificOutput
				.additionalContext ?? ''
		expect(ctxStr).toContain('thrower own message')
		expect(ctxStr).not.toContain('Owner mail')
	})

	it("a failing registry listing drops the setup nudge but keeps the caller's own mail", () => {
		// A non-mux root session with no standing owner — the nudge branch this session WOULD get
		// (asserted two cases above) is computed from `listAgents`, so the failure is what removes it.
		register({ store, env: { CYBERLEGION_AGENT_ID: 'thrower2' } }, { handle: 'thrower2', harness: 'claude' })
		send({ store, now: () => 11 }, { fromId: bob.id, to: 'thrower2', body: 'thrower2 own message' })
		const env = { CYBERLEGION_AGENT_ID: 'thrower2' }
		const ctxStr =
			injectInbox({ store: storeThrowingOn('listAgents'), env }, 'SessionStart')?.hookSpecificOutput
				.additionalContext ?? ''
		expect(ctxStr).toContain('thrower2 own message')
		expect(ctxStr).not.toContain('Legion setup')
	})
})
