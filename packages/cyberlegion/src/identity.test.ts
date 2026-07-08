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
	registerStanding,
	resolveAgent,
	resolveRecipient,
	resolveSelfId,
	standingId,
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

	it('writes the agent record and a pane pointer in a herdr pane', () => {
		const rec = register(ctx({ HERDR_ENV: '1', HERDR_PANE_ID: 'w3:p4' }), { handle: 'alice', harness: 'claude' })
		expect(loadAgent(store, rec.id)?.handle).toBe('alice')
		expect(loadAgent(store, rec.id)?.harness).toBe('claude')
		expect(loadAgent(store, rec.id)?.pane).toEqual({ mux: 'herdr', id: 'w3:p4' })
		expect(store.resolvePaneId('w3:p4')).toBe(rec.id)
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
	// Scenario Outline: the current multiplexer pane keys self-identity — tmux ($TMUX_PANE) and
	// herdr ($HERDR_PANE_ID) both resolve self via the pane pointer with no explicit id.
	it.each([
		['tmux', { TMUX: 't', TMUX_PANE: '%7' }],
		['herdr', { HERDR_ENV: '1', HERDR_PANE_ID: 'w3:p4' }],
	] as const)('recovers the id from the %s pane index', (_mux, e) => {
		const rec = register(ctx(e), { handle: 'a', harness: 'claude' })
		expect(resolveSelfId(ctx(e))).toBe(rec.id)
	})

	it('$CYBERLEGION_AGENT_ID resolves self-id only when in no multiplexer pane (no $TMUX_PANE, no $HERDR_PANE_ID)', () => {
		expect(resolveSelfId(ctx({ CYBERLEGION_AGENT_ID: 'envid' }))).toBe('envid')
	})

	// Scenario Outline: an unregistered multiplexer pane does not fall back to $CYBERLEGION_AGENT_ID —
	// for tmux and herdr alike, an unmapped pane resolves to undefined (never the env id).
	it.each([
		['tmux', { TMUX_PANE: '%unknown', CYBERLEGION_AGENT_ID: 'envid' }],
		['herdr', { HERDR_PANE_ID: 'w9:pX', CYBERLEGION_AGENT_ID: 'envid' }],
	] as const)('an unregistered %s pane does not fall back to $CYBERLEGION_AGENT_ID', (_mux, e) => {
		expect(resolveSelfId(ctx(e))).toBeUndefined()
	})
})

describe('prune liveness per mux', () => {
	const FRESH = 1_700_000_000_000
	// paneExists(tmux): live iff `has-session` succeeds OR the pane id is in `list-panes -a`.
	const tmuxExec =
		(livePanes: string[]): Exec =>
		(cmd, args) => {
			if (cmd !== 'tmux') return null
			if (args[0] === 'has-session') return null // never a session name in these fixtures
			if (args[0] === 'list-panes') return livePanes.join('\n')
			if (args[0] === 'display-message') return '@1' // window id lookup during register
			return null
		}
	// paneExists(herdr): live iff `herdr pane read` returns non-null (dead panes fail → null).
	const herdrExec =
		(livePanes: string[]): Exec =>
		(cmd, args) => {
			if (cmd !== 'herdr') return null
			if (args[0] === 'pane' && args[1] === 'read') return livePanes.includes(args[2]!) ? '' : null
			return null
		}

	it('marks a tmux-pane agent exited when its pane is gone', () => {
		const rec = register(ctx({ TMUX: 't', TMUX_PANE: '%7' }, tmuxExec([])), { handle: 'a', harness: 'claude' })
		const changed = prune({ store, exec: tmuxExec([]), now: () => FRESH })
		expect(changed.map((r) => r.id)).toContain(rec.id)
		expect(loadAgent(store, rec.id)?.status).toBe('exited')
	})

	it('marks a herdr-pane agent exited when its pane is gone', () => {
		const rec = register(ctx({ HERDR_ENV: '1', HERDR_PANE_ID: 'w3:p4' }), { handle: 'a', harness: 'claude' })
		const changed = prune({ store, exec: herdrExec([]), now: () => FRESH })
		expect(changed.map((r) => r.id)).toContain(rec.id)
		expect(loadAgent(store, rec.id)?.status).toBe('exited')
	})

	it('leaves a live herdr-pane agent with a fresh lastSeen untouched, and never probes it with tmux', () => {
		const rec = register(ctx({ HERDR_ENV: '1', HERDR_PANE_ID: 'w3:p4' }), { handle: 'a', harness: 'claude' })
		const calls: string[] = []
		const exec: Exec = (cmd, args) => {
			calls.push(cmd)
			if (cmd === 'herdr' && args[0] === 'pane' && args[1] === 'read') return '' // pane is live (empty content)
			return null
		}
		const changed = prune({ store, exec, now: () => FRESH })
		expect(changed).toEqual([])
		expect(loadAgent(store, rec.id)?.status).toBe('active')
		expect(calls).not.toContain('tmux') // a herdr pane is never liveness-checked via tmux
	})

	it('leaves a live tmux-pane agent (pane still in list-panes) untouched', () => {
		const rec = register(ctx({ TMUX: 't', TMUX_PANE: '%7' }, tmuxExec(['%7'])), { handle: 'a', harness: 'claude' })
		const changed = prune({ store, exec: tmuxExec(['%7']), now: () => FRESH })
		expect(changed).toEqual([])
		expect(loadAgent(store, rec.id)?.status).toBe('active')
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

describe('standing identity', () => {
	// Scenario 1: identity owner mints a standing record with a handle-derived stable id.
	it('registerStanding mints a standing record with a handle-derived stable id', () => {
		const rec = registerStanding(ctx({}), { handle: 'homa' })
		expect(rec.kind).toBe('standing')
		expect(rec.handle).toBe('homa')
		expect(rec.id).toBe(standingId('homa'))
		expect(rec.id).not.toMatch(/^[0-9a-f]{16}$/)
	})

	// Scenario 2: registering the same owner handle again is idempotent.
	it('registerStanding is idempotent per handle', () => {
		const a = registerStanding(ctx({}), { handle: 'homa' })
		const b = registerStanding(ctx({}), { handle: 'homa' })
		expect(b.id).toBe(a.id)
		expect(listAgents(store).filter((r) => r.kind === 'standing')).toHaveLength(1)
	})

	// Scenario 3: a standing record carries no tmux pane and is not pane-indexed; the caller's own
	// pane still resolves to the caller's own session id.
	it('a standing record has no tmux pane and is not pane-indexed', () => {
		const e = { TMUX: 't', TMUX_PANE: '%9' }
		const session = register(ctx(e), { handle: 'alice', harness: 'claude' })
		const standing = registerStanding(ctx(e), { handle: 'homa' })
		expect(standing.pane).toBeNull()
		expect(resolveSelfId(ctx(e))).toBe(session.id)
		expect(store.resolvePaneId('%9')).toBe(session.id)
	})

	// Scenario 4: prune never marks a standing record exited even when its lastSeen is stale.
	it('prune never marks a standing record exited even when stale', () => {
		registerStanding({ store, env: {}, now: () => 1_700_000_000_000 }, { handle: 'homa' })
		const changed = prune({ store, exec: nullExec, now: () => 1_700_000_000_000 + 999_999_999 })
		expect(changed).toEqual([])
		expect(loadAgent(store, standingId('homa'))?.status).toBe('active')
	})

	// Scenario 5: who lists a standing record alongside session agents (membership only).
	it('listAgents includes a standing record alongside session agents', () => {
		register(ctx({ TMUX: 't', TMUX_PANE: '%1' }), { handle: 'alice', harness: 'claude' })
		registerStanding(ctx({}), { handle: 'homa' })
		const handles = listAgents(store).map((r) => r.handle)
		expect(handles).toContain('alice')
		expect(handles).toContain('homa')
	})

	// Scenario 6: a handle shared by a live session and a standing record resolves (as a recipient)
	// to the standing record.
	it('resolveRecipient prefers the standing record on a handle collision', () => {
		register(ctx({ TMUX: 't', TMUX_PANE: '%2' }), { handle: 'homa', harness: 'claude' })
		const standing = registerStanding(ctx({}), { handle: 'homa' })
		expect(resolveRecipient(store, 'homa')).toBe(standing.id)
	})

	it('resolveAgent prefers the standing record on a handle collision', () => {
		register(ctx({ TMUX: 't', TMUX_PANE: '%4' }), { handle: 'homa', harness: 'claude' })
		const standing = registerStanding(ctx({}), { handle: 'homa' })
		expect(resolveAgent(store, 'homa').id).toBe(standing.id)
	})

	// Scenario 8: a record with no kind field is treated as a session — prune considers it for
	// staleness like any session.
	it('a record with no kind field is treated as a session by prune', () => {
		const rec = register(ctx({ CYBERLEGION_AGENT_ID: 'legacy' }), { handle: 'legacy', harness: 'claude' })
		expect(rec.kind).toBeUndefined()
		const changed = prune({ store, exec: nullExec, now: () => 1_700_000_000_000 + 999_999_999 })
		expect(changed.map((r) => r.id)).toContain(rec.id)
		expect(loadAgent(store, rec.id)?.status).toBe('exited')
	})
})
