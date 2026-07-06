import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import {
	detectHarness,
	type Exec,
	type IdContext,
	listAgents,
	loadAgent,
	prune,
	register,
	resolveRecipient,
	resolveSelfId,
	touch,
} from './identity.ts'
import { FileStore } from './store/file-store.ts'

let store: FileStore
beforeEach(() => {
	store = new FileStore(join(mkdtempSync(join(tmpdir(), 'cl-')), 'hub'))
})

const nullExec: Exec = () => null
const paneExec =
	(paneCmd: string): Exec =>
	(_c, args) =>
		args[4] === '#{pane_current_command}' ? paneCmd : null

function ctx(env: NodeJS.ProcessEnv, exec: Exec = nullExec): IdContext {
	return { store, env, exec, now: () => 1_700_000_000_000 }
}

describe('register records who and where', () => {
	it('writes the agent record and a pane pointer', () => {
		const rec = register(ctx({ TMUX: '/tmp/x,1,0', TMUX_PANE: '%3' }), { handle: 'alice', harness: 'claude' })
		expect(loadAgent(store, rec.id)?.handle).toBe('alice')
		expect(loadAgent(store, rec.id)?.harness).toBe('claude')
		expect(store.resolvePaneId('%3')).toBe(rec.id)
	})

	it('stamps the hub root with the tracked config.json marker', () => {
		register(ctx({ TMUX: '/tmp/x,1,0', TMUX_PANE: '%3' }), { handle: 'alice', harness: 'claude' })
		expect(existsSync(join(store.root, 'config.json'))).toBe(true)
	})

	it('is idempotent for the same pane — keeps the same id', () => {
		const e = { TMUX: 't', TMUX_PANE: '%3' }
		const a = register(ctx(e), { handle: 'alice', harness: 'claude' })
		const b = register(ctx(e), { harness: 'claude' })
		expect(b.id).toBe(a.id)
		expect(listAgents(store)).toHaveLength(1)
	})

	it('fails cleanly when it cannot write the registry (no partial record)', () => {
		writeFileSync(store.root, 'not a dir') // root is a file → mkdir under it fails
		expect(() => register(ctx({ TMUX: 't', TMUX_PANE: '%1' }), { handle: 'a', harness: 'claude' })).toThrow()
	})
})

describe('harness auto-detect', () => {
	it('explicit --harness overrides detection', () => {
		expect(detectHarness('codex', ctx({ CLAUDECODE: '1' }))).toBe('codex')
	})
	it('reads the tmux pane command when not given', () => {
		expect(detectHarness(undefined, ctx({ TMUX_PANE: '%1' }, paneExec('cursor-agent')))).toBe('cursor')
	})
	it('requires --harness when nothing is detectable', () => {
		expect(() => register(ctx({}), { handle: 'a' })).toThrow(/harness/)
	})
})

describe('pane-keyed self-recall', () => {
	it('recovers the id from the pane index', () => {
		const e = { TMUX: 't', TMUX_PANE: '%7' }
		const rec = register(ctx(e), { handle: 'a', harness: 'claude' })
		expect(resolveSelfId(ctx(e))).toBe(rec.id)
	})
	it('$CYBERLEGION_AGENT_ID resolves self-id when there is no $TMUX_PANE (no shared self file)', () => {
		expect(resolveSelfId(ctx({ CYBERLEGION_AGENT_ID: 'envid' }))).toBe('envid')
	})
	it('an unregistered pane does not fall back to $CYBERLEGION_AGENT_ID', () => {
		expect(resolveSelfId(ctx({ TMUX_PANE: '%unknown', CYBERLEGION_AGENT_ID: 'envid' }))).toBeUndefined()
	})
})

describe('who + liveness', () => {
	it('lists an empty registry as no agents', () => {
		expect(listAgents(store)).toEqual([])
	})
	it('bumps last-seen on prune scan without a live pane', () => {
		register(ctx({ CYBERLEGION_AGENT_ID: 'x' }), { handle: 'a', harness: 'claude' })
		// a very old lastSeen would be pruned; a fresh one survives
		expect(prune({ store, exec: nullExec, now: () => 1_700_000_000_000 })).toEqual([])
	})

	it('touch() refreshes the caller last-seen and is a no-op when unregistered', () => {
		const env = { CYBERLEGION_AGENT_ID: 'x' }
		const rec = register(
			{ store, env, exec: nullExec, now: () => 1_700_000_000_000 },
			{ handle: 'a', harness: 'claude' },
		)
		touch({ store, env, exec: nullExec, now: () => 1_700_000_060_000 })
		expect(loadAgent(store, rec.id)?.lastSeen).toBe(new Date(1_700_000_060_000).toISOString())
		expect(() => touch({ store, env: {}, exec: nullExec })).not.toThrow()
	})
})

describe('resolveRecipient', () => {
	it('resolves by handle or id, throws on unknown', () => {
		const rec = register(ctx({ CYBERLEGION_AGENT_ID: 'x', TMUX_PANE: '' }), { handle: 'bob', harness: 'claude' })
		expect(resolveRecipient(store, 'bob')).toBe(rec.id)
		expect(resolveRecipient(store, rec.id)).toBe(rec.id)
		expect(() => resolveRecipient(store, 'ghost')).toThrow(/ghost/)
	})
})
