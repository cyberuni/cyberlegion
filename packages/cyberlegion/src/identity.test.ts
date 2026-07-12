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
	reconcile,
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

describe('spec:cyberlegion/identity', () => {
	describe('register records who and where', () => {
		it('register writes the agent record and a pane pointer', () => {
			const rec = register(ctx({ TMUX: '/tmp/x,1,0', TMUX_PANE: '%3' }), { handle: 'alice', harness: 'claude' })
			expect(loadAgent(store, rec.id)?.handle).toBe('alice')
			expect(loadAgent(store, rec.id)?.harness).toBe('claude')
			expect(store.resolvePaneId('%3')).toBe(rec.id)
		})

		it('register writes the agent record and a pane pointer in a herdr pane', () => {
			const rec = register(ctx({ HERDR_ENV: '1', HERDR_PANE_ID: 'w3:p4' }), { handle: 'alice', harness: 'claude' })
			expect(loadAgent(store, rec.id)?.handle).toBe('alice')
			expect(loadAgent(store, rec.id)?.harness).toBe('claude')
			expect(loadAgent(store, rec.id)?.pane).toEqual({ mux: 'herdr', id: 'w3:p4' })
			expect(store.resolvePaneId('w3:p4')).toBe(rec.id)
		})

		it('register stamps the hub root with the tracked marker', () => {
			register(ctx({ TMUX: '/tmp/x,1,0', TMUX_PANE: '%3' }), { handle: 'alice', harness: 'claude' })
			expect(existsSync(join(store.root, 'config.json'))).toBe(true)
		})

		it('register is idempotent for the same pane', () => {
			const e = { TMUX: 't', TMUX_PANE: '%3' }
			const a = register(ctx(e), { handle: 'alice', harness: 'claude' })
			const b = register(ctx(e), { harness: 'claude' })
			expect(b.id).toBe(a.id)
			expect(listAgents(store)).toHaveLength(1)
		})

		it('register fails cleanly when the registry cannot be written', () => {
			writeFileSync(store.root, 'not a dir') // root is a file → mkdir under it fails
			expect(() => register(ctx({ TMUX: 't', TMUX_PANE: '%1' }), { handle: 'a', harness: 'claude' })).toThrow()
		})
	})

	describe('harness auto-detect', () => {
		it('explicit --harness overrides detection', () => {
			expect(detectHarness('codex', ctx({ CLAUDECODE: '1' }))).toBe('codex')
		})

		it('an unrecognized explicit --harness is rejected', () => {
			expect(() => detectHarness('grok', ctx({}))).toThrow(/claude \| cursor \| codex/)
		})

		// Scenario Outline: harness-specific env vars are detected absent --harness — CLAUDECODE,
		// CURSOR_X (any CURSOR*-prefixed key), and CODEX_X (any CODEX*-prefixed key) each resolve
		// their harness with no --harness flag.
		it.each([
			['CLAUDECODE', 'claude'],
			['CURSOR_X', 'cursor'],
			['CODEX_X', 'codex'],
		] as const)('harness-specific env vars are detected absent --harness', (envKey, harness) => {
			expect(detectHarness(undefined, ctx({ [envKey]: '1' }))).toBe(harness)
		})

		it("absent env signals, the tmux pane's own running command is probed", () => {
			expect(detectHarness(undefined, ctx({ TMUX_PANE: '%1' }, paneExec('cursor-agent')))).toBe('cursor')
		})

		it('an undetectable harness requires --harness rather than guessing', () => {
			expect(() => register(ctx({}), { handle: 'a' })).toThrow(/harness/)
		})
	})

	describe('pane-keyed self-recall', () => {
		it("a later call recovers the agent's own id from its pane", () => {
			const e = { TMUX: 't', TMUX_PANE: '%7' }
			const rec = register(ctx(e), { handle: 'a', harness: 'claude' })
			expect(resolveSelfId(ctx(e))).toBe(rec.id)
		})

		// Scenario Outline: the current multiplexer pane keys self-identity — tmux ($TMUX_PANE) and
		// herdr ($HERDR_PANE_ID) both resolve self via the pane pointer with no explicit id.
		it.each([
			['tmux', { TMUX: 't', TMUX_PANE: '%7' }],
			['herdr', { HERDR_ENV: '1', HERDR_PANE_ID: 'w3:p4' }],
		] as const)('the current multiplexer pane keys self-identity', (_mux, e) => {
			const rec = register(ctx(e), { handle: 'a', harness: 'claude' })
			expect(resolveSelfId(ctx(e))).toBe(rec.id)
		})

		it('$CYBERLEGION_AGENT_ID resolves self-id only when the session is in no multiplexer pane', () => {
			expect(resolveSelfId(ctx({ CYBERLEGION_AGENT_ID: 'envid' }))).toBe('envid')
		})

		// Scenario Outline: an unregistered multiplexer pane does not fall back to $CYBERLEGION_AGENT_ID —
		// for tmux and herdr alike, an unmapped pane resolves to undefined (never the env id).
		it.each([
			['tmux', { TMUX_PANE: '%unknown', CYBERLEGION_AGENT_ID: 'envid' }],
			['herdr', { HERDR_PANE_ID: 'w9:pX', CYBERLEGION_AGENT_ID: 'envid' }],
		] as const)('an unregistered multiplexer pane does not fall back to $CYBERLEGION_AGENT_ID', (_mux, e) => {
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

		it('prune marks an agent exited when its tmux pane is gone', () => {
			const rec = register(ctx({ TMUX: 't', TMUX_PANE: '%7' }, tmuxExec([])), { handle: 'a', harness: 'claude' })
			const changed = prune({ store, env: {}, exec: tmuxExec([]), now: () => FRESH })
			expect(changed.map((r) => r.id)).toContain(rec.id)
			expect(loadAgent(store, rec.id)?.status).toBe('exited')
		})

		it('prune marks an agent exited when its herdr pane is gone', () => {
			const rec = register(ctx({ HERDR_ENV: '1', HERDR_PANE_ID: 'w3:p4' }), { handle: 'a', harness: 'claude' })
			const changed = prune({ store, env: {}, exec: herdrExec([]), now: () => FRESH })
			expect(changed.map((r) => r.id)).toContain(rec.id)
			expect(loadAgent(store, rec.id)?.status).toBe('exited')
		})

		it('prune leaves a live herdr-pane agent untouched', () => {
			const rec = register(ctx({ HERDR_ENV: '1', HERDR_PANE_ID: 'w3:p4' }), { handle: 'a', harness: 'claude' })
			const calls: string[] = []
			const exec: Exec = (cmd, args) => {
				calls.push(cmd)
				if (cmd === 'herdr' && args[0] === 'pane' && args[1] === 'read') return '' // pane is live (empty content)
				return null
			}
			const changed = prune({ store, env: {}, exec, now: () => FRESH })
			expect(changed).toEqual([])
			expect(loadAgent(store, rec.id)?.status).toBe('active')
			expect(calls).not.toContain('tmux') // a herdr pane is never liveness-checked via tmux
		})

		it('prune marks an agent exited when its last-seen is stale', () => {
			const rec = register(ctx({ CYBERLEGION_AGENT_ID: 'legacy' }), { handle: 'legacy', harness: 'claude' })
			const changed = prune({ store, env: {}, exec: nullExec, now: () => 1_700_000_000_000 + 999_999_999 })
			expect(changed.map((r) => r.id)).toContain(rec.id)
			expect(loadAgent(store, rec.id)?.status).toBe('exited')
		})

		it('prune leaves a live, recently-seen agent untouched', () => {
			const rec = register(ctx({ TMUX: 't', TMUX_PANE: '%7' }, tmuxExec(['%7'])), { handle: 'a', harness: 'claude' })
			const changed = prune({ store, env: {}, exec: tmuxExec(['%7']), now: () => FRESH })
			expect(changed).toEqual([])
			expect(loadAgent(store, rec.id)?.status).toBe('active')
		})
	})

	describe('reconcile: mux-scoped cull against the live pane set', () => {
		const FRESH = 1_700_000_000_000
		const tmuxListExec =
			(lines: string[]): Exec =>
			(cmd, args) => {
				if (cmd !== 'tmux') return null
				if (args[0] === 'list-panes') return lines.join('\n')
				if (args[0] === 'display-message') return '@1'
				return null
			}
		const herdrListExec =
			(panes: Array<{ pane_id: string; agent?: string }>): Exec =>
			(cmd, args) => {
				if (cmd !== 'herdr') return null
				if (args[0] === 'pane' && args[1] === 'list') {
					return JSON.stringify({ result: { panes } })
				}
				return null
			}

		it('reconcile marks a record exited when its pane is absent from the live set', () => {
			const e = { TMUX: 't', TMUX_PANE: '%7' }
			const rec = register(ctx(e, tmuxListExec(['%7 claude /repo'])), { handle: 'a', harness: 'claude' })
			const changed = reconcile({ store, env: e, exec: tmuxListExec([]), now: () => FRESH })
			expect(changed.map((r) => r.id)).toContain(rec.id)
			expect(loadAgent(store, rec.id)?.status).toBe('exited')
		})

		it('reconcile marks a record exited from within a herdr session too', () => {
			const e = { HERDR_ENV: '1', HERDR_PANE_ID: 'w3:p4' }
			const rec = register(ctx(e), { handle: 'a', harness: 'claude' })
			const changed = reconcile({ store, env: e, exec: herdrListExec([]), now: () => FRESH })
			expect(changed.map((r) => r.id)).toContain(rec.id)
			expect(loadAgent(store, rec.id)?.status).toBe('exited')
		})

		it("reconcile is mux-scoped and never culls the other mux's records", () => {
			const herdrRec = register(ctx({ HERDR_ENV: '1', HERDR_PANE_ID: 'w9:p1' }), { handle: 'b', harness: 'claude' })
			const tmuxEnv = { TMUX: 't', TMUX_PANE: '%7' }
			const changed = reconcile({ store, env: tmuxEnv, exec: tmuxListExec([]), now: () => FRESH })
			expect(changed.map((r) => r.id)).not.toContain(herdrRec.id)
			expect(loadAgent(store, herdrRec.id)?.status).toBe('active')
		})

		it('reconcile never touches a standing record', () => {
			registerStanding({ store, env: {}, now: () => FRESH }, { handle: 'homa' })
			const e = { TMUX: 't', TMUX_PANE: '%7' }
			reconcile({ store, env: e, exec: tmuxListExec([]), now: () => FRESH })
			expect(loadAgent(store, standingId('homa'))?.status).toBe('active')
		})

		it('a pane-null record is not pane-culled by reconcile', () => {
			const rec = register(ctx({ CYBERLEGION_AGENT_ID: 'legacy' }), { handle: 'legacy', harness: 'claude' })
			const e = { TMUX: 't', TMUX_PANE: '%7' }
			const changed = reconcile({ store, env: e, exec: tmuxListExec([]), now: () => FRESH })
			expect(changed.map((r) => r.id)).not.toContain(rec.id)
			expect(loadAgent(store, rec.id)?.status).toBe('active')
		})

		it('reconcile outside any multiplexer pane culls nothing', () => {
			register(ctx({ TMUX: 't', TMUX_PANE: '%7' }, tmuxListExec(['%7 claude /repo'])), {
				handle: 'a',
				harness: 'claude',
			})
			expect(reconcile({ store, env: {}, exec: tmuxListExec([]), now: () => FRESH })).toEqual([])
		})

		it('prune reconcile-culls too', () => {
			const e = { TMUX: 't', TMUX_PANE: '%7' }
			const rec = register(ctx(e, tmuxListExec(['%7 claude /repo'])), { handle: 'a', harness: 'claude' })
			const changed = prune({ store, env: e, exec: tmuxListExec([]), now: () => FRESH })
			expect(changed.map((r) => r.id)).toContain(rec.id)
			expect(loadAgent(store, rec.id)?.status).toBe('exited')
		})
	})

	describe('who + liveness', () => {
		it('lists an empty registry as no agents', () => {
			expect(listAgents(store)).toEqual([])
		})

		it('bumps last-seen on prune scan without a live pane', () => {
			register(ctx({ CYBERLEGION_AGENT_ID: 'x' }), { handle: 'a', harness: 'claude' })
			// a very old lastSeen would be pruned; a fresh one survives
			expect(prune({ store, env: {}, exec: nullExec, now: () => 1_700_000_000_000 })).toEqual([])
		})

		it("touch refreshes the caller's last-seen", () => {
			const env = { CYBERLEGION_AGENT_ID: 'x' }
			const rec = register(
				{ store, env, exec: nullExec, now: () => 1_700_000_000_000 },
				{ handle: 'a', harness: 'claude' },
			)
			touch({ store, env, exec: nullExec, now: () => 1_700_000_060_000 })
			expect(loadAgent(store, rec.id)?.lastSeen).toBe(new Date(1_700_000_060_000).toISOString())
		})

		it('touch is a no-op for an unregistered caller', () => {
			expect(() => touch({ store, env: {}, exec: nullExec })).not.toThrow()
		})

		it('who excludes exited agents by default, --all includes them', () => {
			const bobEnv = { CYBERLEGION_AGENT_ID: 'b' }
			register(
				{ store, env: bobEnv, exec: nullExec, now: () => 1_700_000_000_000 },
				{ handle: 'bob', harness: 'claude' },
			)
			// register alice much later so, at prune time, only bob's lastSeen is past the staleness window
			const later = 1_700_000_000_000 + 999_999_999
			const aliceEnv = { CYBERLEGION_AGENT_ID: 'a' }
			const alice = register(
				{ store, env: aliceEnv, exec: nullExec, now: () => later },
				{ handle: 'alice', harness: 'claude' },
			)
			prune({ store, env: {}, exec: nullExec, now: () => later })
			expect(loadAgent(store, alice.id)?.status).toBe('active')

			const defaultList = listAgents(store).filter((a) => a.status !== 'exited')
			expect(defaultList.map((a) => a.handle)).toEqual(['alice'])

			const allList = listAgents(store)
			expect(allList.map((a) => a.handle).sort()).toEqual(['alice', 'bob'])
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
		it('unit register --standing mints a standing record with a handle-derived stable id', () => {
			const rec = registerStanding(ctx({}), { handle: 'homa' })
			expect(rec.kind).toBe('standing')
			expect(rec.handle).toBe('homa')
			expect(rec.id).toBe(standingId('homa'))
			expect(rec.id).not.toMatch(/^[0-9a-f]{16}$/)
		})

		it('registering the same owner handle again is idempotent', () => {
			const a = registerStanding(ctx({}), { handle: 'homa' })
			const b = registerStanding(ctx({}), { handle: 'homa' })
			expect(b.id).toBe(a.id)
			expect(listAgents(store).filter((r) => r.kind === 'standing')).toHaveLength(1)
		})

		it('a standing record carries no tmux pane and is not pane-indexed', () => {
			const e = { TMUX: 't', TMUX_PANE: '%9' }
			const session = register(ctx(e), { handle: 'alice', harness: 'claude' })
			const standing = registerStanding(ctx(e), { handle: 'homa' })
			expect(standing.pane).toBeNull()
			expect(resolveSelfId(ctx(e))).toBe(session.id)
			expect(store.resolvePaneId('%9')).toBe(session.id)
		})

		it('prune never marks a standing record exited even when its last-seen is stale', () => {
			registerStanding({ store, env: {}, now: () => 1_700_000_000_000 }, { handle: 'homa' })
			const changed = prune({ store, env: {}, exec: nullExec, now: () => 1_700_000_000_000 + 999_999_999 })
			expect(changed).toEqual([])
			expect(loadAgent(store, standingId('homa'))?.status).toBe('active')
		})

		it('listAgents includes a standing record alongside session agents', () => {
			register(ctx({ TMUX: 't', TMUX_PANE: '%1' }), { handle: 'alice', harness: 'claude' })
			registerStanding(ctx({}), { handle: 'homa' })
			const handles = listAgents(store).map((r) => r.handle)
			expect(handles).toContain('alice')
			expect(handles).toContain('homa')
		})

		it('an owner handle colliding with a live session resolves to the standing record', () => {
			register(ctx({ TMUX: 't', TMUX_PANE: '%2' }), { handle: 'homa', harness: 'claude' })
			const standing = registerStanding(ctx({}), { handle: 'homa' })
			expect(resolveRecipient(store, 'homa')).toBe(standing.id)
		})

		it('resolveAgent prefers the standing record on a handle collision', () => {
			register(ctx({ TMUX: 't', TMUX_PANE: '%4' }), { handle: 'homa', harness: 'claude' })
			const standing = registerStanding(ctx({}), { handle: 'homa' })
			expect(resolveAgent(store, 'homa').id).toBe(standing.id)
		})

		it('a record with no kind field is treated as a session', () => {
			const rec = register(ctx({ CYBERLEGION_AGENT_ID: 'legacy2' }), { handle: 'legacy2', harness: 'claude' })
			expect(rec.kind).toBeUndefined()
			const changed = prune({ store, env: {}, exec: nullExec, now: () => 1_700_000_000_000 + 999_999_999 })
			expect(changed.map((r) => r.id)).toContain(rec.id)
			expect(loadAgent(store, rec.id)?.status).toBe('exited')
		})
	})
})
