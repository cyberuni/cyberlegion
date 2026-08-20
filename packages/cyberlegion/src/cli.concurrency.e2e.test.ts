import { execFileSync, spawn } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it } from 'vitest'

// Everything in cli.e2e.test.ts drives the CLI SEQUENTIALLY — one child process at a time, one
// after another. That never exercises the actual hazard cyberlegion's design accepts by being
// daemonless and filesystem-only: real, independent OS processes racing each other against the
// SAME on-disk store at the SAME instant. This suite spawns N genuinely concurrent child processes
// (node:child_process `spawn`, started together and awaited together via Promise.all, not
// `execFileSync` one at a time) against one shared --space hub and asserts the invariants a
// multi-process mailbox promises: no message lost, no duplicate delivery, exactly one winner for a
// contended ack, and no reader ever surfaces a CorruptRecordError from a write it raced.
const BIN = fileURLToPath(new URL('../bin/cyberlegion.mjs', import.meta.url))

// This suite may itself run inside a real tmux/herdr pane (it does, under cyberlegion's own dev
// loop) — every ambient multiplexer signal must be stripped from each child's env, or all N
// children inherit the SAME real pane, `register` treats that as "already registered for this
// pane" and idempotently returns the ONE existing record for every call instead of minting N, and
// the test would appear to catch a store-level id collision that never happened. Mirrors
// cli.e2e.test.ts's `baseEnv`.
const MUX_ENV_KEYS = [
	'TMUX',
	'TMUX_PANE',
	'HERDR_ENV',
	'HERDR_PANE_ID',
	'CYBER_MUX',
	'CYBER_MUX_PANE',
	'CYBERLEGION_MUX',
	'CYBERLEGION_MUX_PANE',
]
function baseEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
	const merged = { ...process.env, ...env }
	for (const k of MUX_ENV_KEYS) if (!(k in env)) delete merged[k]
	return merged
}

let space: string
beforeEach(() => {
	space = join(mkdtempSync(join(tmpdir(), 'cl-conc-')), 'hub')
})

function legion(args: string[], env: NodeJS.ProcessEnv = {}): string {
	return execFileSync('node', [BIN, ...args, '--space', space], {
		encoding: 'utf8',
		env: baseEnv(env),
	})
}

interface Result {
	stdout: string
	stderr: string
	status: number | null
}

/** Start `args` as a real child process WITHOUT awaiting it — the caller collects an array of these
 * and only THEN awaits all of them, so every process in a batch is actually running concurrently on
 * the OS rather than one finishing before the next starts (which `execFileSync` in a loop would
 * give you). */
function start(args: string[], env: NodeJS.ProcessEnv = {}): Promise<Result> {
	return new Promise((resolve) => {
		const child = spawn('node', [BIN, ...args, '--space', space], { env: baseEnv(env) })
		let stdout = ''
		let stderr = ''
		child.stdout.on('data', (d) => {
			stdout += d
		})
		child.stderr.on('data', (d) => {
			stderr += d
		})
		child.on('close', (status) => resolve({ stdout, stderr, status }))
	})
}

describe('spec:cyberlegion/concurrency — N real, concurrent CLI processes against one store', () => {
	it('concurrent `mail send` to the same inbox: no message is lost, none delivered twice', async () => {
		const N = 8
		const senders = Array.from({ length: N }, (_, i) => `sender-${i}`)
		legion(['unit', 'register', '--standing', '--handle', 'homa'])
		for (const h of senders) legion(['unit', 'register', '--harness', 'claude', '--handle', h])

		const runs = senders.map((h, i) =>
			start(['mail', 'send', '--from', h, '--to', 'homa', '--body', `msg-${i}`, '--format', 'json']),
		)
		const results = await Promise.all(runs)

		for (const r of results) {
			expect(r.status).toBe(0)
			expect(r.stderr).not.toMatch(/CorruptRecordError/)
		}
		const sentIds = results.map((r) => JSON.parse(r.stdout).id)
		expect(new Set(sentIds).size).toBe(N) // every id unique — no store-level id collision

		const inbox: { id: string; body: string }[] = JSON.parse(
			legion(['mail', 'inbox', '--owner', 'homa', '--format', 'json']),
		)
		expect(inbox).toHaveLength(N) // none lost, none duplicated
		const bodies = new Set(inbox.map((m) => m.body))
		for (let i = 0; i < N; i++) expect(bodies.has(`msg-${i}`)).toBe(true)
	})

	it('concurrent `unit register` of distinct handles: every unit lands, none clobbers another', async () => {
		const N = 8
		const runs = Array.from({ length: N }, (_, i) =>
			start(['unit', 'register', '--harness', 'claude', '--handle', `unit-${i}`, '--format', 'json']),
		)
		const results = await Promise.all(runs)

		for (const r of results) {
			expect(r.status).toBe(0)
			expect(r.stderr).not.toMatch(/CorruptRecordError/)
		}
		const ids = results.map((r) => JSON.parse(r.stdout).id)
		expect(new Set(ids).size).toBe(N) // no two concurrent registrations minted/collided on the same id

		const who: { handle: string; id: string }[] = JSON.parse(legion(['unit', 'who', '--all', '--format', 'json']))
		const handles = new Set(who.map((u) => u.handle))
		for (let i = 0; i < N; i++) expect(handles.has(`unit-${i}`)).toBe(true) // every registration actually persisted
		expect(who).toHaveLength(N) // and nothing beyond the N registered — no phantom/corrupted record
	})

	it('concurrent `unit claim` of the SAME standing owner from two real processes: no crash, no corruption, a clean winner', async () => {
		// Two real processes racing `claimPresence`'s load→mutate→save (identity.ts). NOTE on this
		// test's actual detection power (an honest finding, not a claim): because `claimPresence`
		// unconditionally overwrites the WHOLE record and every write is already a single atomic
		// rename (finding 1), the on-disk end state is a clean id belonging to one claimant EVEN WITH
		// `identity.test.ts`'s lock-wiring ablated — verified directly, not merely assumed; see the CR
		// report. This test therefore only proves the race doesn't crash the CLI or corrupt the store
		// under real OS scheduling, which still matters (a `LockTimeoutError`, a thrown
		// `CorruptRecordError`, or a torn value on disk are all real ways this could go wrong that
		// nothing else here exercises with genuine multi-process concurrency). The claim that the LOCK
		// specifically is load-bearing is proven separately and reliably by `identity.test.ts`'s
		// `withLock`-call-recording test, which the ablation in the CR report demonstrates fails when
		// the lock is removed and this one does not.
		legion(['unit', 'register', '--standing', '--handle', 'homa'])
		const claimEnv = (pane: string): NodeJS.ProcessEnv => ({ CYBER_MUX: 'tmux', CYBER_MUX_PANE: pane })
		const alice = JSON.parse(
			legion(['unit', 'register', '--harness', 'claude', '--handle', 'alice', '--format', 'json'], claimEnv('%1')),
		)
		const bob = JSON.parse(
			legion(['unit', 'register', '--harness', 'claude', '--handle', 'bob', '--format', 'json'], claimEnv('%2')),
		)

		const [aliceRun, bobRun] = await Promise.all([
			start(['unit', 'claim', 'homa'], claimEnv('%1')),
			start(['unit', 'claim', 'homa'], claimEnv('%2')),
		])
		expect(aliceRun.status).toBe(0)
		expect(bobRun.status).toBe(0)
		for (const r of [aliceRun, bobRun]) expect(r.stderr).not.toMatch(/CorruptRecordError/)

		const shown = JSON.parse(legion(['unit', 'claim', 'homa', '--show', '--format', 'json']))
		expect([alice.id, bob.id]).toContain(shown.presence) // a clean, whole id — one of the two claimants, not garbage
	})

	it('concurrent `mail ack` of the SAME message: exactly one winner, the message is never lost or double-consumed', async () => {
		const N = 8
		legion(['unit', 'register', '--standing', '--handle', 'homa'])
		legion(['unit', 'register', '--harness', 'claude', '--handle', 'alice'])
		const sent = JSON.parse(
			legion(['mail', 'send', '--from', 'alice', '--to', 'homa', '--body', 'contended', '--format', 'json']),
		)

		const runs = Array.from({ length: N }, () => start(['mail', 'ack', sent.id, '--owner', 'homa']))
		const results = await Promise.all(runs)

		const succeeded = results.filter((r) => r.status === 0)
		const failed = results.filter((r) => r.status !== 0)
		expect(succeeded).toHaveLength(1) // exactly one winner — an ack is not a merge, it's a state transition
		expect(failed).toHaveLength(N - 1)
		for (const r of results) expect(r.stderr).not.toMatch(/CorruptRecordError/) // no reader saw a torn write

		// The message itself survives the contention untouched — still exactly one copy, now read.
		const inbox: { id: string }[] = JSON.parse(legion(['mail', 'inbox', '--owner', 'homa', '--format', 'json']))
		expect(inbox.filter((m) => m.id === sent.id)).toHaveLength(1)
	})
})
