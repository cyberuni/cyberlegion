import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it } from 'vitest'

// Exercises the actual built CLI entrypoint (bin → dist/cli.mjs) end-to-end, over an isolated
// --space hub root per test so runs never collide with a real global hub.
const BIN = fileURLToPath(new URL('../bin/cyberlegion.mjs', import.meta.url))

let space: string
beforeEach(() => {
	space = join(mkdtempSync(join(tmpdir(), 'cl-e2e-')), 'hub')
})

// Strip any ambient multiplexer signal from the inherited env: these tests drive identity through
// fresh registration or an explicit $CYBERLEGION_AGENT_ID, so a real tmux/herdr pane in the host
// env (this suite may itself run inside one) must not key or override the caller's self-identity.
const MUX_ENV_KEYS = ['TMUX', 'TMUX_PANE', 'HERDR_ENV', 'HERDR_PANE_ID', 'CYBERLEGION_MUX', 'CYBERLEGION_MUX_PANE']
function baseEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
	const merged = { ...process.env, ...env }
	for (const k of MUX_ENV_KEYS) if (!(k in env)) delete merged[k]
	return merged
}

/** Run the CLI against a given --space hub root. */
function legionAt(hub: string, args: string[], env: NodeJS.ProcessEnv = {}): string {
	// --space is defined on each leaf subcommand, not the root program, so it must follow the
	// group/verb tokens rather than precede them.
	return execFileSync('node', [BIN, ...args, '--space', hub], {
		encoding: 'utf8',
		env: baseEnv(env),
	})
}

function legion(args: string[], env: NodeJS.ProcessEnv = {}): string {
	return legionAt(space, args, env)
}

/** Like `legion` but also returns stderr (for warning/next-step assertions). */
function legionOut(args: string[], env: NodeJS.ProcessEnv = {}): { stdout: string; stderr: string } {
	const res = spawnSync('node', [BIN, ...args, '--space', space], {
		encoding: 'utf8',
		env: baseEnv(env),
	})
	return { stdout: res.stdout, stderr: res.stderr }
}

describe('spec:cyberlegion/unit', () => {
	describe('unit group', () => {
		it('register prints the new identity as TOON by default', () => {
			const out = legion(['unit', 'register', '--harness', 'claude', '--handle', 'alice'])
			expect(out).toContain('handle: alice')
			expect(out).toContain('harness: claude')
		})

		it('register --format json emits parseable JSON', () => {
			const out = legion(['unit', 'register', '--harness', 'claude', '--handle', 'alice', '--format', 'json'])
			expect(JSON.parse(out)).toMatchObject({ handle: 'alice', harness: 'claude' })
		})

		it('who lists every non-exited unit with a definitive aggregate line', () => {
			legion(['unit', 'register', '--harness', 'claude', '--handle', 'alice'])
			legion(['unit', 'register', '--harness', 'cursor', '--handle', 'bob'])
			const out = legion(['unit', 'who'])
			expect(out).toContain('alice')
			expect(out).toContain('bob')
			expect(out).toContain('2 units')
		})

		it('who reports a definitive empty state when nothing is registered', () => {
			const out = legion(['unit', 'who'])
			expect(out).toContain('0 units')
		})

		it('the top-level who command behaves like unit who', () => {
			legion(['unit', 'register', '--harness', 'claude', '--handle', 'alice'])
			expect(legion(['who'])).toContain('alice')
		})
	})

	describe('whoami', () => {
		it("whoami prints this session's own identity", () => {
			const env = { CYBERLEGION_AGENT_ID: 'alice1' }
			legion(['unit', 'register', '--harness', 'claude', '--handle', 'alice'], env)
			const out = legion(['unit', 'whoami'], env)
			expect(out).toContain('handle: alice')
			expect(out).toContain('harness: claude')
			expect(out).toContain('status: active')
		})

		it('whoami errors when the session has no identity yet', () => {
			expect(() => legion(['unit', 'whoami'])).toThrow()
			const { stderr } = legionOut(['unit', 'whoami'])
			expect(stderr).toMatch(/register/i)
		})
	})

	describe('standing identity — unit register --standing', () => {
		it('mints a standing record for a fresh handle', () => {
			const out = legion(['unit', 'register', '--standing', '--handle', 'homa'])
			expect(out).toContain('handle: homa')
			expect(out).toContain('kind: standing')
		})

		it('unit register --standing warns when a live session already claims that handle', () => {
			legion(['unit', 'register', '--harness', 'claude', '--handle', 'homa'])
			const { stdout, stderr } = legionOut(['unit', 'register', '--standing', '--handle', 'homa'])
			expect(stderr).toMatch(/live session already claims/i)
			expect(stdout).toContain('kind: standing')
			const who = JSON.parse(legion(['unit', 'who', '--all', '--format', 'json']))
			expect(who.filter((a: { handle: string }) => a.handle === 'homa')).toHaveLength(2)
		})

		it('who lists a standing record alongside session agents', () => {
			legion(['unit', 'register', '--harness', 'claude', '--handle', 'alice'])
			legion(['unit', 'register', '--standing', '--handle', 'homa'])
			const out = legion(['unit', 'who'])
			expect(out).toContain('alice')
			expect(out).toContain('homa')
			expect(out).toContain('2 units')
		})

		it('bare unit register --standing lists the standing records', () => {
			legion(['unit', 'register', '--harness', 'claude', '--handle', 'alice'])
			legion(['unit', 'register', '--standing', '--handle', 'homa'])
			legion(['unit', 'register', '--standing', '--handle', 'ops'])
			const listed = JSON.parse(legion(['unit', 'register', '--standing', '--format', 'json'])) as { handle: string }[]
			const handles = listed.map((a) => a.handle)
			expect(handles).toContain('homa')
			expect(handles).toContain('ops')
			expect(handles).not.toContain('alice')
		})
	})

	describe('standing owner presence — unit claim', () => {
		// The caller's pane + multiplexer in one env: $CYBERLEGION_MUX is the override probeMultiplexer
		// trusts outright (so the claim's spawn-capability gate passes with no real mux), and
		// $CYBERLEGION_MUX_PANE is the fast-path pane that keys the caller's own self-id.
		const claimEnv = (pane: string) => ({ CYBERLEGION_MUX: 'tmux', CYBERLEGION_MUX_PANE: pane })

		/** A registered caller in its own pane — the unit a claim binds as the presence. */
		const caller = (handle: string, pane: string) => {
			const env = claimEnv(pane)
			const rec = JSON.parse(
				legion(['unit', 'register', '--harness', 'claude', '--handle', handle, '--format', 'json'], env),
			)
			return { env, id: rec.id as string }
		}

		it("unit claim binds the caller's unit as a standing owner's presence", () => {
			legion(['unit', 'register', '--standing', '--handle', 'homa'])
			const alice = caller('alice', '%1')
			const out = legion(['unit', 'claim', 'homa'], alice.env)
			expect(out).toContain('owner: homa')
			expect(out).toContain(`presence: ${alice.id}`)
		})

		it('unit claim --show reports the bound unit', () => {
			legion(['unit', 'register', '--standing', '--handle', 'homa'])
			const alice = caller('alice', '%1')
			legion(['unit', 'claim', 'homa'], alice.env)
			expect(legion(['unit', 'claim', 'homa', '--show'])).toContain(`presence: ${alice.id}`)
		})

		it('unit claim --show reports a definitive none when nothing is bound', () => {
			legion(['unit', 'register', '--standing', '--handle', 'homa'])
			expect(legion(['unit', 'claim', 'homa', '--show'])).toContain('presence: none')
		})

		it('unit claim --clear unbinds the presence', () => {
			legion(['unit', 'register', '--standing', '--handle', 'homa'])
			const alice = caller('alice', '%1')
			legion(['unit', 'claim', 'homa'], alice.env)
			expect(legion(['unit', 'claim', 'homa', '--clear'])).toContain('presence: none')
			expect(legion(['unit', 'claim', 'homa', '--show'])).toContain('presence: none')
		})

		it('unit claim --clear is a no-op when no presence is bound', () => {
			legion(['unit', 'register', '--standing', '--handle', 'homa'])
			expect(() => legion(['unit', 'claim', 'homa', '--clear'])).not.toThrow()
			expect(legion(['unit', 'claim', 'homa', '--show'])).toContain('presence: none')
		})

		it('claiming a handle with no standing record fails loud rather than minting one', () => {
			const alice = caller('alice', '%1')
			expect(() => legion(['unit', 'claim', 'homa'], alice.env)).toThrow()
			const { stderr } = legionOut(['unit', 'claim', 'homa'], alice.env)
			expect(stderr).toMatch(/no standing owner \\"homa\\"/)
			const standing = JSON.parse(legion(['unit', 'register', '--standing', '--format', 'json'])) as unknown[]
			expect(standing).toHaveLength(0)
		})

		// --clear is forgiving about nothing being bound, never about the owner not existing.
		it('clearing a presence for a handle with no standing record fails loud too', () => {
			expect(() => legion(['unit', 'claim', 'homa', '--clear'])).toThrow()
			const { stderr } = legionOut(['unit', 'claim', 'homa', '--clear'])
			expect(stderr).toMatch(/no standing owner \\"homa\\"/)
		})

		it('unit claim throws when the caller reports no multiplexer', () => {
			legion(['unit', 'register', '--standing', '--handle', 'homa'])
			const noMux = { CYBERLEGION_MUX: 'none', CYBERLEGION_AGENT_ID: 'lone1' }
			legion(['unit', 'register', '--harness', 'claude', '--handle', 'lone'], noMux)
			expect(() => legion(['unit', 'claim', 'homa'], noMux)).toThrow()
			const { stderr } = legionOut(['unit', 'claim', 'homa'], noMux)
			expect(stderr).toMatch(/needs a multiplexer to open panes/)
			expect(legion(['unit', 'claim', 'homa', '--show'])).toContain('presence: none')
		})

		it('unit claim --format json emits parseable JSON for bind, show, and clear', () => {
			legion(['unit', 'register', '--standing', '--handle', 'homa'])
			const alice = caller('alice', '%1')
			expect(JSON.parse(legion(['unit', 'claim', 'homa', '--format', 'json'], alice.env))).toMatchObject({
				owner: 'homa',
				presence: alice.id,
			})
			expect(JSON.parse(legion(['unit', 'claim', 'homa', '--show', '--format', 'json']))).toEqual({
				presence: alice.id,
			})
			expect(JSON.parse(legion(['unit', 'claim', 'homa', '--clear', '--format', 'json']))).toEqual({ presence: null })
			expect(JSON.parse(legion(['unit', 'claim', 'homa', '--show', '--format', 'json']))).toEqual({ presence: null })
		})
	})

	describe('attach — the hub main pane', () => {
		const paneEnv = (pane: string) => ({ TMUX: 't', TMUX_PANE: pane })

		it("attach records the caller's current pane as the hub main pane", () => {
			legion(['attach'], paneEnv('%1'))
			expect(legion(['attach', '--show'])).toContain('mainPane: %1')
		})

		it('attach throws when the caller is in no multiplexer pane', () => {
			expect(() => legion(['attach'])).toThrow()
			expect(legion(['attach', '--show'])).toContain('mainPane: none')
		})

		it('binding from a different pane moves the main pane', () => {
			legion(['attach'], paneEnv('%1'))
			legion(['attach'], paneEnv('%2'))
			expect(legion(['attach', '--show'])).toContain('mainPane: %2')
		})

		it('attach --clear removes the binding', () => {
			legion(['attach'], paneEnv('%1'))
			legion(['attach', '--clear'])
			expect(legion(['attach', '--show'])).toContain('mainPane: none')
		})

		it('attach --clear is a no-op when nothing is bound', () => {
			expect(() => legion(['attach', '--clear'])).not.toThrow()
			expect(legion(['attach', '--show'])).toContain('mainPane: none')
		})

		it('attach --show prints the bound pane', () => {
			legion(['attach'], paneEnv('%5'))
			expect(legion(['attach', '--show'])).toContain('mainPane: %5')
		})

		it('attach --show reports a definitive none when unbound', () => {
			expect(legion(['attach', '--show'])).toContain('mainPane: none')
		})

		it('binding a main pane neither creates nor requires a standing owner', () => {
			legion(['attach'], paneEnv('%1'))
			const standing = JSON.parse(legion(['unit', 'register', '--standing', '--format', 'json'])) as {
				handle: string
			}[]
			expect(standing).toHaveLength(0)
		})
	})

	describe('bare invocation — content-first status (AXI #8)', () => {
		it('bare cyberlegion prints a compact status and exits 0', () => {
			// execFileSync throws on a non-zero exit, so reaching the assertions proves exit 0.
			const out = legion([])
			expect(out).toContain('self: -')
			expect(out).toContain('unread: 0')
			expect(out).toContain('units: 0')
		})

		it("bare status reflects this session's own identity, unread, and live units", () => {
			const env = { CYBERLEGION_AGENT_ID: 'alice1' }
			legion(['unit', 'register', '--harness', 'claude', '--handle', 'alice'], env)
			legion(['mail', 'send', '--to', 'alice', '--subject', 'hi', '--body', 'yo'], env)
			const out = legion([], env)
			expect(out).toContain('self: alice')
			expect(out).toContain('unread: 1')
			expect(out).toContain('units: 1')
		})

		it('--format json emits a parseable status', () => {
			expect(JSON.parse(legion(['--format', 'json']))).toMatchObject({ self: null, unread: 0, units: 0 })
		})
	})

	// spec: focus, nudge, read: error cases (unresolvable ref, no live pane) — resolveTarget (cli.ts)
	// guards both before any command touches the session adapter, so nothing is focused/delivered/
	// scraped on either error. These tests never reach a real session adapter, since resolveTarget
	// throws first — proving the guard runs before any adapter call.
	describe('focus, nudge, read: error cases', () => {
		it('focus on an unresolvable ref errors and focuses nothing', () => {
			const { stderr } = legionOut(['unit', 'focus', 'ghost'])
			expect(() => legion(['unit', 'focus', 'ghost'])).toThrow()
			expect(stderr).toMatch(/no agent addressable as/)
			expect(stderr).toContain('ghost')
		})

		it('focus on a unit with no known session pane errors and focuses nothing', () => {
			// Registering with no mux env in the child process (baseEnv strips TMUX/HERDR_*) yields a
			// unit with pane: null — a registered id that resolveTarget still cannot address.
			const rec = JSON.parse(
				legion(['unit', 'register', '--harness', 'claude', '--handle', 'nopane', '--format', 'json']),
			)
			expect(rec.pane).toBeNull()
			const { stderr } = legionOut(['unit', 'focus', rec.id])
			expect(() => legion(['unit', 'focus', rec.id])).toThrow()
			expect(stderr).toMatch(/no known session pane/)
		})

		it('nudge on an unresolvable ref errors and delivers nothing', () => {
			const { stderr } = legionOut(['unit', 'nudge', 'ghost'])
			expect(() => legion(['unit', 'nudge', 'ghost'])).toThrow()
			expect(stderr).toMatch(/no agent addressable as/)
			expect(stderr).toContain('ghost')
		})

		it('nudge on a unit with no known session pane errors and delivers nothing', () => {
			const rec = JSON.parse(
				legion(['unit', 'register', '--harness', 'claude', '--handle', 'nopane', '--format', 'json']),
			)
			expect(rec.pane).toBeNull()
			const { stderr } = legionOut(['unit', 'nudge', rec.id])
			expect(() => legion(['unit', 'nudge', rec.id])).toThrow()
			expect(stderr).toMatch(/no known session pane/)
		})

		it('read on an unresolvable ref errors and scrapes nothing', () => {
			const { stderr } = legionOut(['unit', 'read', 'ghost'])
			expect(() => legion(['unit', 'read', 'ghost'])).toThrow()
			expect(stderr).toMatch(/no agent addressable as/)
			expect(stderr).toContain('ghost')
		})

		it('read on a unit with no known session pane errors and scrapes nothing', () => {
			const rec = JSON.parse(
				legion(['unit', 'register', '--harness', 'claude', '--handle', 'nopane', '--format', 'json']),
			)
			expect(rec.pane).toBeNull()
			const { stderr } = legionOut(['unit', 'read', rec.id])
			expect(() => legion(['unit', 'read', rec.id])).toThrow()
			expect(stderr).toMatch(/no known session pane/)
		})

		// spec: close on an unresolvable id errors and reaps nothing — at the CLI, close resolves the
		// ref through resolveAgent (id/handle/branch) BEFORE decommission, so an unresolvable id throws
		// the same "no agent addressable" message as the rest of the cluster and reaps nothing.
		it('close on an unresolvable id errors and reaps nothing', () => {
			const { stderr } = legionOut(['unit', 'close', 'ghost'])
			expect(() => legion(['unit', 'close', 'ghost'])).toThrow()
			expect(stderr).toMatch(/no agent addressable as/)
			expect(stderr).toContain('ghost')
		})
	})
})

describe('mail group', () => {
	it('send + inbox + read + ack round-trip', () => {
		const alice = JSON.parse(
			legion(['unit', 'register', '--harness', 'claude', '--handle', 'alice', '--format', 'json']),
		)
		legion(['unit', 'register', '--harness', 'cursor', '--handle', 'bob'])
		const who: { handle: string; id: string }[] = JSON.parse(legion(['unit', 'who', '--format', 'json']))
		const bobId = who.find((a) => a.handle === 'bob')!.id

		const sent = JSON.parse(
			legion(['mail', 'send', '--from', alice.id, '--to', 'bob', '--body', 'ping', '--format', 'json']),
		)

		const bobEnv = { CYBERLEGION_AGENT_ID: bobId }
		const inboxOut = legion(['mail', 'inbox', '--from', 'alice'], bobEnv)
		expect(inboxOut).toContain('1 messages (1 unread)')

		const readOut = legion(['mail', 'read', sent.id], bobEnv)
		expect(readOut).toContain('ping')

		const ackOut = legion(['mail', 'ack', sent.id], bobEnv)
		expect(ackOut).toContain(`acked: ${sent.id}`)

		const afterAck = legion(['mail', 'inbox', '--unread'], bobEnv)
		expect(afterAck).toContain('0 messages (0 unread)')
	})

	it('mail read --ack prints the body and consumes the message in one step, idempotently', () => {
		const alice = JSON.parse(
			legion(['unit', 'register', '--harness', 'claude', '--handle', 'alice', '--format', 'json']),
		)
		legion(['unit', 'register', '--harness', 'cursor', '--handle', 'bob'])
		const who: { handle: string; id: string }[] = JSON.parse(legion(['unit', 'who', '--format', 'json']))
		const bobEnv = { CYBERLEGION_AGENT_ID: who.find((a) => a.handle === 'bob')!.id }
		const sent = JSON.parse(
			legion(['mail', 'send', '--from', alice.id, '--to', 'bob', '--body', 'brief', '--format', 'json']),
		)

		const out = legion(['mail', 'read', sent.id, '--ack'], bobEnv)
		expect(out).toContain('brief')
		expect(out).toContain('acked: true')
		expect(legion(['mail', 'inbox', '--unread'], bobEnv)).toContain('0 messages (0 unread)')

		// idempotent: a second read --ack still prints the body and exits 0 (no double-ack error)
		const again = JSON.parse(legion(['mail', 'read', sent.id, '--ack', '--format', 'json'], bobEnv))
		expect(again.body).toBe('brief')
		expect(again.acked).toBe(false)
	})

	it('inbox reports a definitive empty state and exits 0 for a registered caller with no mail', () => {
		legion(['unit', 'register', '--harness', 'claude', '--handle', 'alice'])
		const who = JSON.parse(legion(['unit', 'who', '--format', 'json']))
		const aliceId = who[0].id
		const out = legion(['mail', 'inbox'], { CYBERLEGION_AGENT_ID: aliceId })
		expect(out).toContain('0 messages (0 unread)')
	})

	it('mail hook emits raw JSON (not TOON) on stdout', () => {
		// A standing owner already exists, so the (non-mux) session-start setup nudge is silenced —
		// isolating this test to the no-brief/no-unread-mail precondition it targets.
		legion(['unit', 'register', '--standing', '--handle', 'homa'])
		legion(['unit', 'register', '--harness', 'claude', '--handle', 'alice'])
		const who = JSON.parse(legion(['unit', 'who', '--format', 'json']))
		const aliceId = who.find((a: { handle: string }) => a.handle === 'alice').id
		const out = legion(['mail', 'hook', '--event', 'SessionStart'], { CYBERLEGION_AGENT_ID: aliceId })
		expect(out.trim()).toBe('') // no brief, no unread mail — nothing injected, still exit 0
	})
})

describe('the standing owner mailbox — mail --owner', () => {
	it('mail send --to <owner> delivers exactly one message to the standing owner inbox', () => {
		legion(['unit', 'register', '--standing', '--handle', 'homa'])
		legion(['unit', 'register', '--harness', 'claude', '--handle', 'alice'])
		legion(['mail', 'send', '--from', 'alice', '--to', 'homa', '--body', 'report'])
		const out = legion(['mail', 'inbox', '--owner', 'homa'])
		expect(out).toContain('1 messages (1 unread)')
	})

	it('mail inbox --owner lists the standing owner mailbox, not the caller own inbox', () => {
		legion(['unit', 'register', '--standing', '--handle', 'homa'])
		const alice = JSON.parse(
			legion(['unit', 'register', '--harness', 'claude', '--handle', 'alice', '--format', 'json']),
		)
		legion(['mail', 'send', '--from', 'alice', '--to', 'homa', '--body', 'owner mail one'])
		legion(['mail', 'send', '--from', 'alice', '--to', 'homa', '--body', 'owner mail two'])
		legion(['mail', 'send', '--from', 'alice', '--to', 'alice', '--body', 'callers own mail'])
		const out = legion(['mail', 'inbox', '--owner', 'homa'], { CYBERLEGION_AGENT_ID: alice.id })
		expect(out).toContain('2 messages (2 unread)')
		expect(out).not.toContain('callers own mail')
	})

	it('mail read <id> --owner peeks the owner mailbox without consuming', () => {
		legion(['unit', 'register', '--standing', '--handle', 'homa'])
		legion(['unit', 'register', '--harness', 'claude', '--handle', 'alice'])
		const sent = JSON.parse(
			legion(['mail', 'send', '--from', 'alice', '--to', 'homa', '--body', 'peek me', '--format', 'json']),
		)
		const readOut = legion(['mail', 'read', sent.id, '--owner', 'homa'])
		expect(readOut).toContain('peek me')
		const afterRead = legion(['mail', 'inbox', '--owner', 'homa', '--unread'])
		expect(afterRead).toContain('1 messages (1 unread)')
	})

	it('mail read <id> --ack --owner consumes an owner message in one step, idempotently', () => {
		legion(['unit', 'register', '--standing', '--handle', 'homa'])
		legion(['unit', 'register', '--harness', 'claude', '--handle', 'alice'])
		const sent = JSON.parse(
			legion(['mail', 'send', '--from', 'alice', '--to', 'homa', '--body', 'consume me', '--format', 'json']),
		)
		const out = legion(['mail', 'read', sent.id, '--ack', '--owner', 'homa'])
		expect(out).toContain('consume me')
		expect(out).toContain('acked: true')
		expect(legion(['mail', 'inbox', '--owner', 'homa', '--unread'])).toContain('0 messages (0 unread)')
		// idempotent through the owner codepath: a second read --ack still prints, exits 0
		const again = JSON.parse(legion(['mail', 'read', sent.id, '--ack', '--owner', 'homa', '--format', 'json']))
		expect(again.body).toBe('consume me')
		expect(again.acked).toBe(false)
	})

	it('mail ack <id> --owner moves the owner message to the read state', () => {
		legion(['unit', 'register', '--standing', '--handle', 'homa'])
		legion(['unit', 'register', '--harness', 'claude', '--handle', 'alice'])
		const sent = JSON.parse(
			legion(['mail', 'send', '--from', 'alice', '--to', 'homa', '--body', 'ack me', '--format', 'json']),
		)
		const ackOut = legion(['mail', 'ack', sent.id, '--owner', 'homa'])
		expect(ackOut).toContain(`acked: ${sent.id}`)
		const afterAck = legion(['mail', 'inbox', '--owner', 'homa', '--unread'])
		expect(afterAck).toContain('0 messages (0 unread)')
	})

	it('two concurrent mail ack --owner of the same message — the first succeeds, the second errors', () => {
		legion(['unit', 'register', '--standing', '--handle', 'homa'])
		legion(['unit', 'register', '--harness', 'claude', '--handle', 'alice'])
		const sent = JSON.parse(
			legion(['mail', 'send', '--from', 'alice', '--to', 'homa', '--body', 'once', '--format', 'json']),
		)
		legion(['mail', 'ack', sent.id, '--owner', 'homa']) // first ack succeeds
		expect(() => legion(['mail', 'ack', sent.id, '--owner', 'homa'])).toThrow() // second ack errors
		const read = JSON.parse(legion(['mail', 'inbox', '--owner', 'homa', '--format', 'json']))
		expect(read.filter((m: { id: string }) => m.id === sent.id)).toHaveLength(1)
	})

	it('mail --owner on a non-standing handle errors rather than reading a session inbox', () => {
		legion(['unit', 'register', '--harness', 'claude', '--handle', 'liveSession'])
		expect(() => legion(['mail', 'inbox', '--owner', 'liveSession'])).toThrow()
	})
})

// The push-side doorbell, driven through the real CLI flag (not wakeRecipient directly), so the
// --no-nudge → behavior wiring is actually exercised. A live-pane recipient without --no-nudge
// attempts the ring; the mux is pinned to tmux and the pane does not exist, so the ring fails and
// surfaces a best-effort "doorbell not confirmed" warning on stderr (never failing the send). That
// warning is the observable that separates "ring attempted" from "ring suppressed": with --no-nudge
// no ring is attempted and no warning appears. The slow baseline send exhausts nudge's retry cap
// (~4s), hence the widened timeouts.
describe('spec:cyberlegion/mail/doorbell — CLI --no-nudge', () => {
	const muxEnv = { CYBERLEGION_MUX: 'tmux' }

	it('--no-nudge suppresses the delivery doorbell to a peer (the flag reaches the behavior)', () => {
		legion(['unit', 'register', '--harness', 'claude', '--handle', 'alice'])
		legion(['unit', 'register', '--harness', 'claude', '--handle', 'bob'], { TMUX: 't', TMUX_PANE: '%77' })
		// Baseline (non-vacuity): a live-pane peer without --no-nudge attempts the ring → stderr warning,
		// send still succeeds.
		const attempted = legionOut(['mail', 'send', '--from', 'alice', '--to', 'bob', '--body', 'wake'], muxEnv)
		expect(attempted.stdout).toContain('sent:')
		expect(attempted.stderr).toMatch(/doorbell/i)
		// --no-nudge suppresses the ring → no warning, message still delivered.
		const suppressed = legionOut(
			['mail', 'send', '--from', 'alice', '--to', 'bob', '--no-nudge', '--body', 'quiet'],
			muxEnv,
		)
		expect(suppressed.stdout).toContain('sent:')
		expect(suppressed.stderr).not.toMatch(/doorbell/i)
	}, 20_000)

	it("--no-nudge suppresses the doorbell to a standing owner's bound main pane", () => {
		legion(['unit', 'register', '--harness', 'claude', '--handle', 'alice'])
		legion(['unit', 'register', '--standing', '--handle', 'owner'])
		legion(['attach'], { TMUX: 't', TMUX_PANE: '%9' }) // bind the main pane — the human's live presence
		// Baseline (non-vacuity): a standing-owner send with a bound main pane attempts the ring → stderr warning.
		const attempted = legionOut(['mail', 'send', '--from', 'alice', '--to', 'owner', '--body', 'report'], muxEnv)
		expect(attempted.stderr).toMatch(/doorbell/i)
		// --no-nudge suppresses the ring to the bound main pane → no warning.
		const suppressed = legionOut(
			['mail', 'send', '--from', 'alice', '--to', 'owner', '--no-nudge', '--body', 'quiet'],
			muxEnv,
		)
		expect(suppressed.stdout).toContain('sent:')
		expect(suppressed.stderr).not.toMatch(/doorbell/i)
	}, 20_000)
})

describe('AXI fail-loud behavior', () => {
	it('an unknown flag fails loud with a nonzero exit', () => {
		expect(() => legion(['unit', 'who', '--bogus'])).toThrow()
	})

	it('mail send without a caller identity fails with a structured stderr error', () => {
		expect(() => legion(['mail', 'send', '--to', 'ghost', '--body', 'hi'])).toThrow()
	})

	it('unit spawn --at rejects a value outside the allowed set (window was removed)', () => {
		const { stderr } = legionOut(['unit', 'spawn', '--harness', 'claude', '--task', 't', '--at', 'window'])
		expect(() => legion(['unit', 'spawn', '--harness', 'claude', '--task', 't', '--at', 'window'])).toThrow()
		expect(stderr).toMatch(/Allowed choices are pane:right, pane:down, tab, workspace/)
	})
})

describe('agent group', () => {
	function agentsProject(): string {
		const dir = mkdtempSync(join(tmpdir(), 'cl-agent-'))
		mkdirSync(join(dir, '.agents', 'agents'), { recursive: true })
		return dir
	}

	function writeDef(dir: string, name: string, contents: string): void {
		writeFileSync(join(dir, '.agents', 'agents', `${name}.md`), contents)
	}

	it('list reports a definitive empty state when no defs exist', () => {
		const dir = agentsProject()
		const out = legion(['agent', 'list', '--dir', dir])
		expect(out).toContain('0 agent definitions')
	})

	it('list shows name/model/harness for every def', () => {
		const dir = agentsProject()
		writeDef(dir, 'reviewer', '---\nmodel: sonnet\nharness: claude\n---\n\nReview it.\n')
		writeDef(dir, 'writer', '---\nmodel: opus\n---\n\nWrite it.\n')
		const out = legion(['agent', 'list', '--dir', dir])
		expect(out).toContain('2 agent definitions')
		expect(out).toContain('reviewer')
		expect(out).toContain('writer')
	})

	it('show reports the resolved model/effort/harness/warm/interactive and truncated instructions', () => {
		const dir = agentsProject()
		const longBody = 'x'.repeat(300)
		writeDef(dir, 'reviewer', `---\nmodel: sonnet\neffort: high\nharness: claude\nwarm: true\n---\n\n${longBody}\n`)
		const out = legion(['agent', 'show', 'reviewer', '--dir', dir])
		expect(out).toContain('model: sonnet')
		expect(out).toContain('effort: high')
		expect(out).toContain('harness: claude')
		expect(out).toContain('warm: true')
		expect(out).toContain('pass --full')
		expect(out).not.toContain(longBody)
	})

	it('show --full prints the entire instructions body', () => {
		const dir = agentsProject()
		const longBody = 'y'.repeat(300)
		writeDef(dir, 'reviewer', `---\nmodel: sonnet\n---\n\n${longBody}\n`)
		const out = legion(['agent', 'show', 'reviewer', '--dir', dir, '--full'])
		expect(out).toContain(longBody)
	})

	it('show reflects a missing model as a harness-default note rather than erroring', () => {
		const dir = agentsProject()
		writeDef(dir, 'minimal', '---\nharness: claude\n---\n\nDo it.\n')
		const out = legion(['agent', 'show', 'minimal', '--dir', dir])
		expect(out).toContain('(harness default)')
	})

	it('resolve --format json emits the full AgentDef payload', () => {
		const dir = agentsProject()
		writeDef(dir, 'reviewer', '---\nmodel: sonnet\n---\n\nReview it.\n')
		const out = legion(['agent', 'resolve', 'reviewer', '--dir', dir, '--format', 'json'])
		expect(JSON.parse(out)).toMatchObject({ name: 'reviewer', model: 'sonnet', instructions: 'Review it.' })
	})

	it('resolve --file reads an exact path, bypassing name search', () => {
		const dir = agentsProject()
		const outside = mkdtempSync(join(tmpdir(), 'cl-agent-plugin-'))
		writeFileSync(join(outside, 'sdd-impl-judge.md'), '---\nmodel: sonnet\n---\n\nGrade it.\n')
		const out = legion(['agent', 'resolve', '--file', join(outside, 'sdd-impl-judge.md'), '--dir', dir])
		expect(out).toContain('sdd-impl-judge')
	})

	it('path prints the resolved def file path', () => {
		const dir = agentsProject()
		writeDef(dir, 'reviewer', '---\nmodel: sonnet\n---\n\nReview it.\n')
		const out = legion(['agent', 'path', 'reviewer', '--dir', dir])
		expect(out).toContain(join(dir, '.agents', 'agents', 'reviewer.md'))
	})

	it('a bad name fails loud with a nonzero exit and a structured stderr error', () => {
		const dir = agentsProject()
		expect(() => legion(['agent', 'show', 'ghost', '--dir', dir])).toThrow()
	})
})

describe('mux group', () => {
	it('doctor reports harness, mux, hub root, and self-id', () => {
		const out = legion(['mux', 'doctor'])
		expect(out).toContain('hubRoot:')
		expect(out).toContain(space)
	})

	it('mode reports the detected session-backend mode', () => {
		const out = legion(['mux', 'mode'])
		expect(out).toContain('mode:')
	})
})

describe('admin group', () => {
	it('migrate merges one hub root into another and reports the counts', () => {
		const src = join(mkdtempSync(join(tmpdir(), 'cl-mig-src-')), 'hub')
		const dst = join(mkdtempSync(join(tmpdir(), 'cl-mig-dst-')), 'hub')
		const alice = JSON.parse(
			legionAt(src, ['unit', 'register', '--harness', 'claude', '--handle', 'alice', '--format', 'json']),
		)
		legionAt(src, ['unit', 'register', '--harness', 'cursor', '--handle', 'bob'])
		legionAt(src, ['mail', 'send', '--from', alice.id, '--to', 'bob', '--body', 'hi'])
		const out = JSON.parse(legion(['admin', 'migrate', '--from', src, '--to', dst, '--format', 'json']))
		expect(out).toMatchObject({ agents: 2, messages: 1 })
		expect(legionAt(dst, ['unit', 'who', '--all'])).toContain('alice')
	})
})

describe('spec:cyberlegion/init', () => {
	it('a malformed --pin is rejected before any hook is registered', () => {
		const proj = mkdtempSync(join(tmpdir(), 'cl-init-'))
		// execFileSync throws on a non-zero exit — a rejected pin must fail cleanly, not stack-trace.
		expect(() => legion(['init', '--agent', 'claude', '--dir', proj, '--pin', '1.2.3 && evil'])).toThrow()
		expect(existsSync(join(proj, '.claude/settings.json'))).toBe(false)
	})

	it('a --pin that is a version or dist-tag token is accepted', () => {
		const proj = mkdtempSync(join(tmpdir(), 'cl-init-'))
		expect(() => legion(['init', '--agent', 'claude', '--dir', proj, '--pin', '0.2.0'])).not.toThrow()
		const cfg = JSON.parse(readFileSync(join(proj, '.claude/settings.json'), 'utf8'))
		expect(cfg.hooks.SessionStart[0].hooks[0].command).toBe('npx cyberlegion@0.2.0 mail hook --event SessionStart')
	})
})
