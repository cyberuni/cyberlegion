import { execFileSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
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

function legion(args: string[], env: NodeJS.ProcessEnv = {}): string {
	// --space is defined on each leaf subcommand, not the root program, so it must follow the
	// group/verb tokens rather than precede them.
	return execFileSync('node', [BIN, ...args, '--space', space], {
		encoding: 'utf8',
		env: { ...process.env, ...env },
	})
}

describe('identity group', () => {
	it('register prints the new identity as TOON by default', () => {
		const out = legion(['identity', 'register', '--harness', 'claude', '--handle', 'alice'])
		expect(out).toContain('handle: alice')
		expect(out).toContain('harness: claude')
	})

	it('register --format json emits parseable JSON', () => {
		const out = legion(['identity', 'register', '--harness', 'claude', '--handle', 'alice', '--format', 'json'])
		expect(JSON.parse(out)).toMatchObject({ handle: 'alice', harness: 'claude' })
	})

	it('who lists every registered peer with a definitive aggregate line', () => {
		legion(['identity', 'register', '--harness', 'claude', '--handle', 'alice'])
		legion(['identity', 'register', '--harness', 'cursor', '--handle', 'bob'])
		const out = legion(['identity', 'who'])
		expect(out).toContain('alice')
		expect(out).toContain('bob')
		expect(out).toContain('2 agents')
	})

	it('who reports a definitive empty state when nothing is registered', () => {
		const out = legion(['identity', 'who'])
		expect(out).toContain('0 agents')
	})

	it('the top-level `who` alias behaves like `identity who`', () => {
		legion(['identity', 'register', '--harness', 'claude', '--handle', 'alice'])
		expect(legion(['who'])).toContain('alice')
	})
})

describe('mail group', () => {
	it('send + inbox + read + ack round-trip', () => {
		const alice = JSON.parse(
			legion(['identity', 'register', '--harness', 'claude', '--handle', 'alice', '--format', 'json']),
		)
		legion(['identity', 'register', '--harness', 'cursor', '--handle', 'bob'])
		const who: { handle: string; id: string }[] = JSON.parse(legion(['identity', 'who', '--format', 'json']))
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

	it('inbox reports a definitive empty state and exits 0 for a registered caller with no mail', () => {
		legion(['identity', 'register', '--harness', 'claude', '--handle', 'alice'])
		const who = JSON.parse(legion(['identity', 'who', '--format', 'json']))
		const aliceId = who[0].id
		const out = legion(['mail', 'inbox'], { CYBERLEGION_AGENT_ID: aliceId })
		expect(out).toContain('0 messages (0 unread)')
	})

	it('mail hook emits raw JSON (not TOON) on stdout', () => {
		legion(['identity', 'register', '--harness', 'claude', '--handle', 'alice'])
		const who = JSON.parse(legion(['identity', 'who', '--format', 'json']))
		const aliceId = who[0].id
		const out = legion(['mail', 'hook', '--event', 'SessionStart'], { CYBERLEGION_AGENT_ID: aliceId })
		expect(out.trim()).toBe('') // no brief, no unread mail — nothing injected, still exit 0
	})
})

describe('AXI fail-loud behavior', () => {
	it('an unknown flag fails loud with a nonzero exit', () => {
		expect(() => legion(['identity', 'who', '--bogus'])).toThrow()
	})

	it('mail send without a caller identity fails with a structured stderr error', () => {
		expect(() => legion(['mail', 'send', '--to', 'ghost', '--body', 'hi'])).toThrow()
	})
})

describe('admin group', () => {
	it('doctor reports harness, mux, hub root, and self-id', () => {
		const out = legion(['admin', 'doctor'])
		expect(out).toContain('hubRoot:')
		expect(out).toContain(space)
	})

	it('mode reports the detected session-backend mode', () => {
		const out = legion(['admin', 'mode'])
		expect(out).toContain('mode:')
	})

	it('install wires the hook into a fresh project dir', () => {
		const dir = mkdtempSync(join(tmpdir(), 'cl-install-'))
		const out = legion(['admin', 'install', '--agent', 'claude', '--dir', dir])
		expect(out).toContain('registered')
	})
})
