import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it } from 'vitest'
import { CorruptRecordError } from './errors.ts'
import { FileStore } from './file-store.ts'
import type { AgentRecord, Message } from './store.ts'

let store: FileStore
beforeEach(() => {
	store = new FileStore(join(mkdtempSync(join(tmpdir(), 'cl-')), 'hub'))
})

const agent = (id: string): AgentRecord => ({
	id,
	handle: id,
	harness: 'claude',
	cwd: '/x',
	status: 'active',
	createdAt: '2026-01-01T00:00:00.000Z',
	lastSeen: '2026-01-01T00:00:00.000Z',
})

const msg = (id: string): Message => ({
	id,
	from: 'a',
	fromHandle: 'a',
	to: 'b',
	body: 'hi',
	ts: 1,
	sentAt: new Date(1).toISOString(),
})

describe('ensureMarker', () => {
	it('creates the root and a config.json marker, idempotently', () => {
		store.ensureMarker()
		expect(existsSync(join(store.root, 'config.json'))).toBe(true)
	})
})

describe('agent registry', () => {
	it('putAgent/getAgent/listAgents/removeAgent round-trip', () => {
		store.putAgent(agent('a1'))
		expect(store.getAgent('a1')?.handle).toBe('a1')
		expect(store.listAgents()).toHaveLength(1)
		store.removeAgent('a1')
		expect(store.getAgent('a1')).toBeUndefined()
	})

	it('removeAgentData clears the data dir without touching the registry entry', () => {
		store.putAgent(agent('a2'))
		store.writeBrief('a2', 'brief text')
		store.removeAgentData('a2')
		expect(store.readBrief('a2')).toBeUndefined()
		expect(store.getAgent('a2')).toBeDefined()
	})
})

describe('pane index', () => {
	it('putPaneIndex/resolvePaneId/removePaneIndex round-trip', () => {
		store.putPaneIndex('%1', 'a1')
		expect(store.resolvePaneId('%1')).toBe('a1')
		store.removePaneIndex('%1')
		expect(store.resolvePaneId('%1')).toBeUndefined()
	})

	// The reverse lookup is bound on a pane id that survives filename sanitization UNCHANGED — a
	// herdr locator, which is already `[A-Za-z0-9_-]`. That is what the lookup is FOR: reaching a
	// unit whose record carries no pane locator, which in practice is the herdr route.
	//
	// It deliberately does not pin what the lookup returns for a tmux id. `findPaneByAgentId` hands
	// back the sanitized FILENAME there (`%3` → `_3`), which is not a pane id any backend accepts —
	// a filed, deliberately-unfixed defect this CR does not bless. The old assertion here froze
	// `'_1'` as the expected value, which meant the eventual fix (return the real pane id) would
	// have failed this test; a lookup bound only on sanitization-invariant ids stays green through
	// that fix and still catches a lookup that matches the wrong entry or none at all.
	it('findPaneByAgentId reaches a unit through the index when its record carries no locator', () => {
		store.putPaneIndex('herdr-pane-1', 'a1')
		store.putPaneIndex('herdr-pane-2', 'a2') // a second entry, so matching the first found is visible
		expect(store.findPaneByAgentId('a1')).toBe('herdr-pane-1')
		expect(store.findPaneByAgentId('a2')).toBe('herdr-pane-2')
		expect(store.findPaneByAgentId('nobody')).toBeUndefined()
		store.removePaneIndex('herdr-pane-1')
		expect(store.findPaneByAgentId('a1')).toBeUndefined()
	})
})

describe('mail: putMessage/listInbox/ackMessage', () => {
	it('is collision-free per message id and moves state on ack', () => {
		store.putMessage('b', msg('m1'))
		expect(store.listInbox('b').unread).toHaveLength(1)
		const acked = store.ackMessage('b', 'm1')
		expect(acked.id).toBe('m1')
		expect(store.listInbox('b').unread).toHaveLength(0)
		expect(store.listInbox('b').read).toHaveLength(1)
	})

	it('ackMessage throws on an unknown or already-acked id', () => {
		expect(() => store.ackMessage('b', 'ghost')).toThrow(/not an unread/)
	})

	it('putMessage writes exactly one file per message', () => {
		store.putMessage('b', msg('m2'))
		const dir = join(store.root, 'inbox', 'b')
		expect(readdirSync(dir)).toEqual(['m2.json'])
	})
})

describe('mail: removeMessage', () => {
	it('removes an unread message', () => {
		store.putMessage('b', msg('m3'))
		store.removeMessage('b', 'm3')
		expect(store.listInbox('b').unread).toHaveLength(0)
	})

	it('removes an already-acked message', () => {
		store.putMessage('b', msg('m4'))
		store.ackMessage('b', 'm4')
		store.removeMessage('b', 'm4')
		expect(store.listInbox('b').read).toHaveLength(0)
	})

	it('throws on an unknown message id', () => {
		expect(() => store.removeMessage('b', 'ghost')).toThrow(/not a message/)
	})
})

describe('main pane (hub-level owner-presence pointer)', () => {
	it('getMainPane is undefined when nothing is bound', () => {
		expect(store.getMainPane()).toBeUndefined()
	})

	it('setMainPane/getMainPane round-trips', () => {
		store.setMainPane('%3')
		expect(store.getMainPane()).toBe('%3')
	})

	it('setMainPane(null) clears an existing binding', () => {
		store.setMainPane('%3')
		store.setMainPane(null)
		expect(store.getMainPane()).toBeUndefined()
	})

	it('setMainPane(null) is a no-op (never throws) when nothing is bound', () => {
		expect(() => store.setMainPane(null)).not.toThrow()
		expect(store.getMainPane()).toBeUndefined()
	})

	it('setMainPane moves the binding on rebind — still exactly one bound pane', () => {
		store.setMainPane('%3')
		store.setMainPane('%9')
		expect(store.getMainPane()).toBe('%9')
	})
})

describe('corrupt records surface a typed, file-named error — never a bare SyntaxError', () => {
	it('getAgent throws CorruptRecordError naming the file when the JSON is torn', () => {
		store.putAgent(agent('c1'))
		const file = join(store.root, 'agents', 'c1.json')
		writeFileSync(file, '{"id": "c1", "handle":') // deliberately truncated, as a torn/crashed write would leave it
		expect(() => store.getAgent('c1')).toThrow(CorruptRecordError)
		try {
			store.getAgent('c1')
			expect.unreachable()
		} catch (err) {
			expect(err).toBeInstanceOf(CorruptRecordError)
			expect((err as CorruptRecordError).file).toBe(file)
		}
	})

	it('listAgents throws CorruptRecordError when one record among several is torn', () => {
		store.putAgent(agent('c2'))
		store.putAgent(agent('c3'))
		writeFileSync(join(store.root, 'agents', 'c3.json'), '{"id"')
		expect(() => store.listAgents()).toThrow(CorruptRecordError)
	})

	it('listInbox throws CorruptRecordError when a message file is torn', () => {
		store.putMessage('b', msg('m5'))
		writeFileSync(join(store.root, 'inbox', 'b', 'm5.json'), '{"id"')
		expect(() => store.listInbox('b')).toThrow(CorruptRecordError)
	})

	// The other half of finding 3: a MISSING record reads as `undefined` (no agent by that id,
	// legitimately), a CORRUPT one throws — those are different conditions and must stay
	// distinguishable rather than both collapsing to "nothing here."
	it('getAgent distinguishes missing (undefined) from corrupt (throws)', () => {
		expect(store.getAgent('never-registered')).toBeUndefined()
		store.putAgent(agent('c4'))
		writeFileSync(join(store.root, 'agents', 'c4.json'), 'not json at all')
		expect(() => store.getAgent('c4')).toThrow(CorruptRecordError)
	})
})

describe('atomic writes: a reader never observes a torn write from a concurrent real writer process', () => {
	it('every read during heavy concurrent writing is either absent or fully valid JSON — never a parse failure', async () => {
		const scriptDir = mkdtempSync(join(tmpdir(), 'cl-racer-'))
		const scriptPath = join(scriptDir, 'racer.mts')
		const fileStoreSrc = fileURLToPath(new URL('./file-store.ts', import.meta.url))
		writeFileSync(
			scriptPath,
			[
				`import { FileStore } from ${JSON.stringify(fileStoreSrc)}`,
				'const store = new FileStore(process.argv[2])',
				`const big = 'x'.repeat(400_000) // large enough that a non-atomic writeFileSync can tear across syscalls`,
				'for (let i = 0; i < 150; i++) {',
				`  store.putAgent({ id: 'racer', handle: 'racer', harness: 'claude', cwd: '/x', status: 'active', createdAt: '2026-01-01T00:00:00.000Z', lastSeen: '2026-01-01T00:00:00.000Z', brief: big + i })`,
				'}',
			].join('\n'),
		)
		const tsxRequire = createRequire(import.meta.url)
		const tsxCli = tsxRequire.resolve('tsx/cli')
		const child = spawn(process.execPath, [tsxCli, scriptPath, store.root], { stdio: ['ignore', 'pipe', 'pipe'] })
		let stderr = ''
		child.stderr?.on('data', (d) => {
			stderr += String(d)
		})
		child.on('error', (e) => {
			stderr += `spawn error: ${e}`
		})

		let sawCorrupt: unknown
		let sawClean = 0
		const deadline = Date.now() + 5000
		while (Date.now() < deadline && child.exitCode === null) {
			try {
				if (store.getAgent('racer')) sawClean++
			} catch (err) {
				sawCorrupt = err
				break
			}
			await new Promise((r) => setImmediate(r))
		}
		if (child.exitCode === null) {
			child.kill()
			await new Promise((resolve) => child.once('exit', resolve))
		}
		if (stderr) console.error('racer stderr:', stderr)

		expect(sawCorrupt).toBeUndefined()
		expect(sawClean).toBeGreaterThan(0) // the race actually happened — this saw real writes, not just misses
	}, 10000)
})
