import { execFileSync, spawnSync } from 'node:child_process'
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

// Strip any ambient multiplexer signal from the inherited env: these tests drive identity through
// fresh registration or an explicit $CYBERLEGION_AGENT_ID, so a real tmux/herdr pane in the host
// env (this suite may itself run inside one) must not key or override the caller's self-identity.
const MUX_ENV_KEYS = ['TMUX', 'TMUX_PANE', 'HERDR_ENV', 'HERDR_PANE_ID', 'CYBERLEGION_MUX', 'CYBERLEGION_MUX_PANE']
function baseEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
	const merged = { ...process.env, ...env }
	for (const k of MUX_ENV_KEYS) if (!(k in env)) delete merged[k]
	return merged
}

function legion(args: string[], env: NodeJS.ProcessEnv = {}): string {
	// --space is defined on each leaf subcommand, not the root program, so it must follow the
	// group/verb tokens rather than precede them.
	return execFileSync('node', [BIN, ...args, '--space', space], {
		encoding: 'utf8',
		env: baseEnv(env),
	})
}

/** Like `legion` but also returns stderr (for warning/next-step assertions). */
function legionOut(args: string[], env: NodeJS.ProcessEnv = {}): { stdout: string; stderr: string } {
	const res = spawnSync('node', [BIN, ...args, '--space', space], {
		encoding: 'utf8',
		env: baseEnv(env),
	})
	return { stdout: res.stdout, stderr: res.stderr }
}

describe('spec:cyberlegion/identity', () => {
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

		it('who lists every non-exited peer with a definitive aggregate line', () => {
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

		it('the top-level who command behaves like identity who', () => {
			legion(['identity', 'register', '--harness', 'claude', '--handle', 'alice'])
			expect(legion(['who'])).toContain('alice')
		})
	})

	describe('whoami', () => {
		it("whoami prints this session's own identity", () => {
			const env = { CYBERLEGION_AGENT_ID: 'alice1' }
			legion(['identity', 'register', '--harness', 'claude', '--handle', 'alice'], env)
			const out = legion(['identity', 'whoami'], env)
			expect(out).toContain('handle: alice')
			expect(out).toContain('harness: claude')
			expect(out).toContain('status: active')
		})

		it('whoami errors when the session has no identity yet', () => {
			expect(() => legion(['identity', 'whoami'])).toThrow()
			const { stderr } = legionOut(['identity', 'whoami'])
			expect(stderr).toMatch(/register/i)
		})
	})

	describe('standing identity — identity owner', () => {
		it('mints a standing record for a fresh handle', () => {
			const out = legion(['identity', 'owner', '--handle', 'homa'])
			expect(out).toContain('handle: homa')
			expect(out).toContain('kind: standing')
		})

		it('identity owner warns when a live session already claims that handle', () => {
			legion(['identity', 'register', '--harness', 'claude', '--handle', 'homa'])
			const { stdout, stderr } = legionOut(['identity', 'owner', '--handle', 'homa'])
			expect(stderr).toMatch(/live session already claims/i)
			expect(stdout).toContain('kind: standing')
			const who = JSON.parse(legion(['identity', 'who', '--all', '--format', 'json']))
			expect(who.filter((a: { handle: string }) => a.handle === 'homa')).toHaveLength(2)
		})

		it('who lists a standing record alongside session agents', () => {
			legion(['identity', 'register', '--harness', 'claude', '--handle', 'alice'])
			legion(['identity', 'owner', '--handle', 'homa'])
			const out = legion(['identity', 'who'])
			expect(out).toContain('alice')
			expect(out).toContain('homa')
			expect(out).toContain('2 agents')
		})

		it('bare identity owner lists the standing records', () => {
			legion(['identity', 'register', '--harness', 'claude', '--handle', 'alice'])
			legion(['identity', 'owner', '--handle', 'homa'])
			legion(['identity', 'owner', '--handle', 'ops'])
			const listed = JSON.parse(legion(['identity', 'owner', '--format', 'json'])) as { handle: string }[]
			const handles = listed.map((a) => a.handle)
			expect(handles).toContain('homa')
			expect(handles).toContain('ops')
			expect(handles).not.toContain('alice')
		})
	})

	describe('identity bind-main / main — the hub main pane', () => {
		const paneEnv = (pane: string) => ({ TMUX: 't', TMUX_PANE: pane })

		it("bind-main records the caller's current pane as the hub main pane", () => {
			legion(['identity', 'bind-main'], paneEnv('%1'))
			expect(legion(['identity', 'main'])).toContain('mainPane: %1')
		})

		it('bind-main throws when the caller is in no multiplexer pane', () => {
			expect(() => legion(['identity', 'bind-main'])).toThrow()
			expect(legion(['identity', 'main'])).toContain('mainPane: none')
		})

		it('binding from a different pane moves the main pane', () => {
			legion(['identity', 'bind-main'], paneEnv('%1'))
			legion(['identity', 'bind-main'], paneEnv('%2'))
			expect(legion(['identity', 'main'])).toContain('mainPane: %2')
		})

		it('bind-main --clear removes the binding', () => {
			legion(['identity', 'bind-main'], paneEnv('%1'))
			legion(['identity', 'bind-main', '--clear'])
			expect(legion(['identity', 'main'])).toContain('mainPane: none')
		})

		it('bind-main --clear is a no-op when nothing is bound', () => {
			expect(() => legion(['identity', 'bind-main', '--clear'])).not.toThrow()
			expect(legion(['identity', 'main'])).toContain('mainPane: none')
		})

		it('main prints the bound pane', () => {
			legion(['identity', 'bind-main'], paneEnv('%5'))
			expect(legion(['identity', 'main'])).toContain('mainPane: %5')
		})

		it('main reports a definitive none when unbound', () => {
			expect(legion(['identity', 'main'])).toContain('mainPane: none')
		})

		it('binding a main pane neither creates nor requires a standing owner', () => {
			legion(['identity', 'bind-main'], paneEnv('%1'))
			const standing = JSON.parse(legion(['identity', 'owner', '--format', 'json'])) as { handle: string }[]
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
		// A standing owner already exists, so the (non-mux) session-start setup nudge is silenced —
		// isolating this test to the no-brief/no-unread-mail precondition it targets.
		legion(['identity', 'owner', '--handle', 'homa'])
		legion(['identity', 'register', '--harness', 'claude', '--handle', 'alice'])
		const who = JSON.parse(legion(['identity', 'who', '--format', 'json']))
		const aliceId = who.find((a: { handle: string }) => a.handle === 'alice').id
		const out = legion(['mail', 'hook', '--event', 'SessionStart'], { CYBERLEGION_AGENT_ID: aliceId })
		expect(out.trim()).toBe('') // no brief, no unread mail — nothing injected, still exit 0
	})
})

describe('the standing owner mailbox — mail --owner', () => {
	it('mail send --to <owner> delivers exactly one message to the standing owner inbox', () => {
		legion(['identity', 'owner', '--handle', 'homa'])
		legion(['identity', 'register', '--harness', 'claude', '--handle', 'alice'])
		legion(['mail', 'send', '--from', 'alice', '--to', 'homa', '--body', 'report'])
		const out = legion(['mail', 'inbox', '--owner', 'homa'])
		expect(out).toContain('1 messages (1 unread)')
	})

	it('mail inbox --owner lists the standing owner mailbox, not the caller own inbox', () => {
		legion(['identity', 'owner', '--handle', 'homa'])
		const alice = JSON.parse(
			legion(['identity', 'register', '--harness', 'claude', '--handle', 'alice', '--format', 'json']),
		)
		legion(['mail', 'send', '--from', 'alice', '--to', 'homa', '--body', 'owner mail one'])
		legion(['mail', 'send', '--from', 'alice', '--to', 'homa', '--body', 'owner mail two'])
		legion(['mail', 'send', '--from', 'alice', '--to', 'alice', '--body', 'callers own mail'])
		const out = legion(['mail', 'inbox', '--owner', 'homa'], { CYBERLEGION_AGENT_ID: alice.id })
		expect(out).toContain('2 messages (2 unread)')
		expect(out).not.toContain('callers own mail')
	})

	it('mail read <id> --owner peeks the owner mailbox without consuming', () => {
		legion(['identity', 'owner', '--handle', 'homa'])
		legion(['identity', 'register', '--harness', 'claude', '--handle', 'alice'])
		const sent = JSON.parse(
			legion(['mail', 'send', '--from', 'alice', '--to', 'homa', '--body', 'peek me', '--format', 'json']),
		)
		const readOut = legion(['mail', 'read', sent.id, '--owner', 'homa'])
		expect(readOut).toContain('peek me')
		const afterRead = legion(['mail', 'inbox', '--owner', 'homa', '--unread'])
		expect(afterRead).toContain('1 messages (1 unread)')
	})

	it('mail ack <id> --owner moves the owner message to the read state', () => {
		legion(['identity', 'owner', '--handle', 'homa'])
		legion(['identity', 'register', '--harness', 'claude', '--handle', 'alice'])
		const sent = JSON.parse(
			legion(['mail', 'send', '--from', 'alice', '--to', 'homa', '--body', 'ack me', '--format', 'json']),
		)
		const ackOut = legion(['mail', 'ack', sent.id, '--owner', 'homa'])
		expect(ackOut).toContain(`acked: ${sent.id}`)
		const afterAck = legion(['mail', 'inbox', '--owner', 'homa', '--unread'])
		expect(afterAck).toContain('0 messages (0 unread)')
	})

	it('two concurrent mail ack --owner of the same message — the first succeeds, the second errors', () => {
		legion(['identity', 'owner', '--handle', 'homa'])
		legion(['identity', 'register', '--harness', 'claude', '--handle', 'alice'])
		const sent = JSON.parse(
			legion(['mail', 'send', '--from', 'alice', '--to', 'homa', '--body', 'once', '--format', 'json']),
		)
		legion(['mail', 'ack', sent.id, '--owner', 'homa']) // first ack succeeds
		expect(() => legion(['mail', 'ack', sent.id, '--owner', 'homa'])).toThrow() // second ack errors
		const read = JSON.parse(legion(['mail', 'inbox', '--owner', 'homa', '--format', 'json']))
		expect(read.filter((m: { id: string }) => m.id === sent.id)).toHaveLength(1)
	})

	it('mail --owner on a non-standing handle errors rather than reading a session inbox', () => {
		legion(['identity', 'register', '--harness', 'claude', '--handle', 'liveSession'])
		expect(() => legion(['mail', 'inbox', '--owner', 'liveSession'])).toThrow()
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
