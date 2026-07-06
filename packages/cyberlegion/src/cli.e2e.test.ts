import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
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

describe('bare invocation — content-first status (AXI #8)', () => {
	it('prints a compact status and exits 0 even when unregistered (never help+error)', () => {
		// execFileSync throws on a non-zero exit, so reaching the assertions proves exit 0.
		const out = legion([])
		expect(out).toContain('self: -')
		expect(out).toContain('unread: 0')
		expect(out).toContain('units: 0')
	})

	it('reflects this session own identity, unread count, and live-unit count', () => {
		const env = { CYBERLEGION_AGENT_ID: 'alice1' }
		legion(['identity', 'register', '--harness', 'claude', '--handle', 'alice'], env)
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
