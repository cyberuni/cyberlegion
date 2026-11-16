import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import {
	type AgentRecord,
	claimPresence,
	clearPresence,
	detectHarness,
	type Exec,
	fillConversations,
	type IdContext,
	listAgents,
	loadAgent,
	onCallerServer,
	openedPaneLocator,
	prune,
	reconcile,
	register,
	registerStanding,
	resolveAgent,
	resolvePresence,
	resolveRecipient,
	resolveSelfId,
	resolveUnitMailbox,
	saveAgent,
	selectAgent,
	sessionLive,
	standingId,
	touch,
} from './identity.ts'
import { FileStore } from './store/file-store.ts'

// cyber-mux (>=0.8.0) prefixes every tmux call with `-u`; cyberlegion's own direct tmux calls do not.
// Fakes answer by the tmux verb, wherever it sits.
const tmuxVerb = (args: readonly string[]) => (args[0] === '-u' ? args[1] : args[0])

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

/** Give a record a worktree that is on disk, so a prune that marks it exited has a reason to keep it. */
function withWorktreeOnDisk(id: string): void {
	const root = mkdtempSync(join(tmpdir(), 'cl-wt-'))
	saveAgent(store, { ...(loadAgent(store, id) as AgentRecord), worktree: { root } })
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

		/** git, answered as if the cwd were `root`, a checkout of the repository at `primary`. */
		const gitExec =
			(root: string, primary: string, branch = 'fix/login'): Exec =>
			(cmd, args) => {
				if (cmd !== 'git') return null
				if (args.includes('--show-toplevel')) return root
				if (args.includes('--abbrev-ref')) return branch
				if (args.includes('--git-common-dir')) return `${primary}/.git`
				return null
			}
		const LINKED = '/src/color-map.worktrees/color-map-2'
		const PRIMARY = '/src/color-map'

		it('register in a linked worktree records the primary checkout and the branch', () => {
			const rec = register(ctx({ TMUX: 't', TMUX_PANE: '%3' }, gitExec(LINKED, PRIMARY)), { harness: 'claude' })
			expect(loadAgent(store, rec.id)?.worktree).toEqual({ root: LINKED, branch: 'fix/login', primaryRoot: PRIMARY })
			// ...which is what a lookup by repository matches: the repo's name, not the worktree folder's
			expect(selectAgent(store, { repo: 'color-map' }).id).toBe(rec.id)
		})

		it('register in a primary checkout records that checkout as its own primary root', () => {
			const rec = register(ctx({ TMUX: 't', TMUX_PANE: '%3' }, gitExec(PRIMARY, PRIMARY, 'main')), {
				harness: 'claude',
			})
			expect(loadAgent(store, rec.id)?.worktree).toMatchObject({ root: PRIMARY, primaryRoot: PRIMARY })
		})

		it('re-register fills in a primary root an older record lacks', () => {
			const e = { TMUX: 't', TMUX_PANE: '%3' }
			const first = register(ctx(e, gitExec(LINKED, PRIMARY)), { harness: 'claude' })
			// a record written before register recorded a primary root
			const old = loadAgent(store, first.id) as AgentRecord
			saveAgent(store, { ...old, worktree: { root: LINKED, branch: 'fix/login' } })
			const again = register(ctx(e, gitExec(LINKED, PRIMARY)), { harness: 'claude' })
			expect(again.id).toBe(first.id)
			expect(loadAgent(store, first.id)?.worktree?.primaryRoot).toBe(PRIMARY)
		})

		it('re-register keeps the rest of an existing worktree, lease included', () => {
			const e = { TMUX: 't', TMUX_PANE: '%3' }
			const first = register(ctx(e, gitExec(LINKED, PRIMARY)), { harness: 'claude' })
			const lease = { leaseId: 'l1', holder: 'cyberlegion:x' }
			saveAgent(store, {
				...(loadAgent(store, first.id) as AgentRecord),
				worktree: { root: LINKED, branch: 'b', lease },
			})
			register(ctx(e, gitExec(LINKED, PRIMARY, 'other')), { harness: 'claude' })
			expect(loadAgent(store, first.id)?.worktree).toEqual({ root: LINKED, branch: 'b', lease, primaryRoot: PRIMARY })
		})

		it('register outside any repository records no worktree', () => {
			const rec = register(ctx({ TMUX: 't', TMUX_PANE: '%3' }), { harness: 'claude' })
			expect(loadAgent(store, rec.id)?.worktree).toBeNull()
			expect(loadAgent(store, rec.id)?.sharedWorktree).toBeUndefined()
		})

		/** A unit whose record owns the linked worktree, as a worktree spawn leaves it. */
		const owner = (): AgentRecord => {
			const rec: AgentRecord = {
				id: 'owner1',
				handle: 'owner',
				harness: 'claude',
				cwd: LINKED,
				worktree: { root: LINKED, branch: 'fix/login', primaryRoot: PRIMARY, lease: { leaseId: 'l1', holder: 'h' } },
				pane: null,
				status: 'active',
				createdAt: '2026-01-01T00:00:00.000Z',
				lastSeen: '2026-01-01T00:00:00.000Z',
			}
			saveAgent(store, rec)
			return rec
		}

		it('register in a worktree another unit owns records it as shared, not as its own', () => {
			owner()
			const rec = register(ctx({ TMUX: 't', TMUX_PANE: '%3' }, gitExec(LINKED, PRIMARY)), { harness: 'claude' })
			const saved = loadAgent(store, rec.id)
			expect(saved?.worktree).toBeNull()
			expect(saved?.sharedWorktree).toEqual({
				root: LINKED,
				branch: 'fix/login',
				primaryRoot: PRIMARY,
				owner: 'owner1',
			})
			// the owner's record is untouched
			expect(loadAgent(store, 'owner1')?.worktree?.lease).toEqual({ leaseId: 'l1', holder: 'h' })
		})

		it('re-register of a unit holding a shared worktree keeps it shared, never owned', () => {
			const e = { TMUX: 't', TMUX_PANE: '%3' }
			// a --cwd spawn's record: no worktree of its own, a shared one whose owner has since gone
			store.putPaneIndex('%3', 'shared1')
			saveAgent(store, {
				id: 'shared1',
				handle: 'shared',
				harness: 'claude',
				cwd: LINKED,
				worktree: null,
				sharedWorktree: { root: LINKED, branch: 'fix/login', primaryRoot: PRIMARY, owner: 'gone1' },
				pane: { mux: 'tmux', id: '%3' },
				status: 'active',
				createdAt: '2026-01-01T00:00:00.000Z',
				lastSeen: '2026-01-01T00:00:00.000Z',
			})
			const rec = register(ctx(e, gitExec(LINKED, PRIMARY)), { harness: 'claude' })
			expect(rec.id).toBe('shared1')
			expect(loadAgent(store, 'shared1')?.worktree).toBeNull()
			expect(loadAgent(store, 'shared1')?.sharedWorktree).toEqual({
				root: LINKED,
				branch: 'fix/login',
				primaryRoot: PRIMARY,
			})
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

		// #154: herdr re-ids a pane when it moves (`herdr pane move` turned wQK:p1 into wQM:p2 while the
		// shell kept $HERDR_PANE_ID=wQK:p1), and pane ids recur on a hub, so the launch-time env id can
		// name another unit's pane. `herdr pane current` answers the calling pane's id as it is now.
		// Before 0.8.2 `pane current` answered another client's focused pane (herdr #2297), so its
		// answer is only trusted from 0.8.2 on; `version` is what `herdr --version` prints.
		const herdrCurrent =
			(paneId: string | null, version: string | null = 'herdr 0.9.5'): Exec =>
			(cmd, args) => {
				if (cmd !== 'herdr') return null
				if (args[0] === '--version') return version
				if (args[0] === 'pane' && args[1] === 'current')
					return (
						paneId &&
						JSON.stringify({ id: 'cli:pane:current', result: { pane: { pane_id: paneId }, type: 'pane_current' } })
					)
				return null
			}

		it('a herdr pane whose $HERDR_PANE_ID went stale resolves the pane herdr reports, not the unit holding the stale id', () => {
			const mover = register(ctx({ HERDR_ENV: '1', HERDR_PANE_ID: 'wH:p1' }), { handle: 'cf-73', harness: 'claude' })
			const holder = register(ctx({ HERDR_ENV: '1', HERDR_PANE_ID: 'w13:p1' }), { handle: 'other', harness: 'claude' })
			const staleEnv = { HERDR_ENV: '1', HERDR_PANE_ID: 'w13:p1' }
			expect(resolveSelfId(ctx(staleEnv, herdrCurrent('wH:p1')))).toBe(mover.id)
			expect(resolveSelfId(ctx(staleEnv, herdrCurrent('w13:p1')))).toBe(holder.id)
		})

		it('a herdr pane herdr cannot report resolves self-id from $HERDR_PANE_ID', () => {
			const rec = register(ctx({ HERDR_ENV: '1', HERDR_PANE_ID: 'w3:p4' }), { handle: 'a', harness: 'claude' })
			expect(resolveSelfId(ctx({ HERDR_ENV: '1', HERDR_PANE_ID: 'w3:p4' }, herdrCurrent(null)))).toBe(rec.id)
		})

		it('register in a herdr pane whose $HERDR_PANE_ID went stale keys the pane herdr reports', () => {
			const holder = register(ctx({ HERDR_ENV: '1', HERDR_PANE_ID: 'w13:p1' }), { handle: 'other', harness: 'claude' })
			const rec = register(ctx({ HERDR_ENV: '1', HERDR_PANE_ID: 'w13:p1' }, herdrCurrent('wH:p1')), {
				handle: 'cf-73',
				harness: 'claude',
			})
			expect(rec.id).not.toBe(holder.id)
			expect(rec.pane).toEqual({ mux: 'herdr', id: 'wH:p1' })
			expect(store.resolvePaneId('w13:p1')).toBe(holder.id)
			expect(store.resolvePaneId('wH:p1')).toBe(rec.id)
		})

		it.each([
			['older than 0.8.2', 'herdr 0.8.1'],
			['of unknown version', null],
		] as const)('a herdr that cannot be trusted to report the calling pane keeps $HERDR_PANE_ID', (_case, version) => {
			register(ctx({ HERDR_ENV: '1', HERDR_PANE_ID: 'wH:p1' }), { handle: 'focused', harness: 'claude' })
			const self = register(ctx({ HERDR_ENV: '1', HERDR_PANE_ID: 'w13:p1' }), { handle: 'self', harness: 'claude' })
			const e = { HERDR_ENV: '1', HERDR_PANE_ID: 'w13:p1' }
			expect(resolveSelfId(ctx(e, herdrCurrent('wH:p1', version)))).toBe(self.id)
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
				if (tmuxVerb(args) === 'has-session') return null // never a session name in these fixtures
				if (tmuxVerb(args) === 'list-panes') return livePanes.join('\n')
				if (tmuxVerb(args) === 'display-message') return '@1' // window id lookup during register
				return null
			}
		// paneExists(herdr): live iff `herdr pane read` returns non-null (dead panes fail → null).
		// `pane list` reports the same live set, so a gone pane is positively absent from an answer.
		const herdrExec =
			(livePanes: string[]): Exec =>
			(cmd, args) => {
				if (cmd !== 'herdr') return null
				if (args[0] === 'pane' && args[1] === 'read') return livePanes.includes(args[2]!) ? '' : null
				if (args[0] === 'pane' && args[1] === 'list')
					return JSON.stringify({ result: { panes: livePanes.map((pane_id) => ({ pane_id, agent: 'claude' })) } })
				return null
			}
		const STALE = FRESH + 999_999_999

		it('prune marks an agent exited when its tmux pane is gone', () => {
			const rec = register(ctx({ TMUX: 't', TMUX_PANE: '%7' }, tmuxExec([])), { handle: 'a', harness: 'claude' })
			withWorktreeOnDisk(rec.id)
			const changed = prune({ store, env: {}, exec: tmuxExec(['%1']), now: () => FRESH })
			expect(changed.map((r) => r.id)).toContain(rec.id)
			expect(loadAgent(store, rec.id)?.status).toBe('exited')
		})

		it('prune marks an agent exited when its herdr pane is gone', () => {
			const rec = register(ctx({ HERDR_ENV: '1', HERDR_PANE_ID: 'w3:p4' }), { handle: 'a', harness: 'claude' })
			withWorktreeOnDisk(rec.id)
			const changed = prune({ store, env: {}, exec: herdrExec(['w0:p1']), now: () => FRESH })
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

		it('prune marks a pane-less agent exited when its last-seen is stale', () => {
			const rec = register(ctx({ CYBERLEGION_AGENT_ID: 'legacy' }), { handle: 'legacy', harness: 'claude' })
			withWorktreeOnDisk(rec.id)
			const changed = prune({ store, env: {}, exec: nullExec, now: () => STALE })
			expect(changed.map((r) => r.id)).toContain(rec.id)
			expect(loadAgent(store, rec.id)?.status).toBe('exited')
		})

		it('prune leaves an agent whose pane is live untouched however stale its last-seen', () => {
			const rec = register(ctx({ TMUX: 't', TMUX_PANE: '%7' }, tmuxExec(['%7'])), { handle: 'a', harness: 'claude' })
			const changed = prune({ store, env: {}, exec: tmuxExec(['%7']), now: () => STALE })
			expect(changed).toEqual([])
			expect(loadAgent(store, rec.id)?.status).toBe('active')
		})

		it('prune leaves a live herdr-pane agent untouched however stale its last-seen', () => {
			const rec = register(ctx({ HERDR_ENV: '1', HERDR_PANE_ID: 'w3:p4' }), { handle: 'a', harness: 'claude' })
			const changed = prune({ store, env: {}, exec: herdrExec(['w3:p4']), now: () => STALE })
			expect(changed).toEqual([])
			expect(loadAgent(store, rec.id)?.status).toBe('active')
		})

		it('prune leaves a pane-bound agent untouched when its multiplexer cannot be queried', () => {
			const rec = register(ctx({ TMUX: 't', TMUX_PANE: '%7' }, tmuxExec([])), { handle: 'a', harness: 'claude' })
			const changed = prune({ store, env: {}, exec: nullExec, now: () => STALE })
			expect(changed).toEqual([])
			expect(loadAgent(store, rec.id)?.status).toBe('active')
		})

		it('prune leaves a herdr-pane agent untouched when herdr cannot be queried', () => {
			const rec = register(ctx({ HERDR_ENV: '1', HERDR_PANE_ID: 'w3:p4' }), { handle: 'a', harness: 'claude' })
			const changed = prune({ store, env: {}, exec: nullExec, now: () => STALE })
			expect(changed).toEqual([])
			expect(loadAgent(store, rec.id)?.status).toBe('active')
		})

		it('prune leaves a live, recently-seen agent untouched', () => {
			const rec = register(ctx({ TMUX: 't', TMUX_PANE: '%7' }, tmuxExec(['%7'])), { handle: 'a', harness: 'claude' })
			const changed = prune({ store, env: {}, exec: tmuxExec(['%7']), now: () => FRESH })
			expect(changed).toEqual([])
			expect(loadAgent(store, rec.id)?.status).toBe('active')
		})

		it('prune leaves a stopped unit untouched however stale its last-seen', () => {
			const rec = register(ctx({ CYBERLEGION_AGENT_ID: 'paused' }), { handle: 'paused', harness: 'claude' })
			saveAgent(store, { ...(loadAgent(store, rec.id) as AgentRecord), status: 'stopped', pane: null })
			const changed = prune({ store, env: {}, exec: nullExec, now: () => 1_700_000_000_000 + 999_999_999 })
			expect(changed).toEqual([])
			expect(loadAgent(store, rec.id)?.status).toBe('stopped')
		})
	})

	describe('prune deletes exited units with nothing left on disk', () => {
		const NOW = 1_700_000_000_000
		const exitedUnit = (id: string, extra: Partial<AgentRecord> = {}): AgentRecord => {
			const rec: AgentRecord = {
				id,
				handle: id,
				harness: 'claude',
				cwd: '/gone',
				pane: null,
				status: 'exited',
				createdAt: '2026-01-01T00:00:00.000Z',
				lastSeen: '2026-01-01T00:00:00.000Z',
				...extra,
			}
			saveAgent(store, rec)
			return rec
		}
		const mail = (to: string) =>
			store.putMessage(to, {
				id: `m-${to}`,
				from: 'op',
				fromHandle: 'op',
				to,
				body: 'dispatch',
				ts: NOW,
				sentAt: new Date(NOW).toISOString(),
			})

		it('prune deletes an exited unit that never had a worktree, with its brief and mailbox', () => {
			exitedUnit('u1')
			store.writeBrief('u1', 'the brief')
			mail('u1')
			const changed = prune({ store, env: {}, exec: nullExec, now: () => NOW })
			expect(changed.map((r) => [r.id, r.pruned])).toEqual([['u1', 'deleted']])
			expect(loadAgent(store, 'u1')).toBeUndefined()
			expect(store.readBrief('u1')).toBeUndefined()
			expect(store.hasMailbox('u1')).toBe(false)
		})

		it('prune deletes an exited unit whose worktree is gone from disk', () => {
			exitedUnit('u1', { worktree: { root: join(tmpdir(), 'cl-no-such-worktree') } })
			const changed = prune({ store, env: {}, exec: nullExec, now: () => NOW })
			expect(changed.map((r) => [r.id, r.pruned])).toEqual([['u1', 'deleted']])
			expect(loadAgent(store, 'u1')).toBeUndefined()
		})

		it('prune keeps an exited unit whose worktree is still on disk', () => {
			const root = mkdtempSync(join(tmpdir(), 'cl-wt-'))
			exitedUnit('u1', { worktree: { root } })
			mail('u1')
			const changed = prune({ store, env: {}, exec: nullExec, now: () => NOW })
			expect(changed).toEqual([])
			expect(loadAgent(store, 'u1')?.status).toBe('exited')
			expect(store.hasMailbox('u1')).toBe(true)
		})

		it("prune deletes an exited unit on its repository's primary checkout without touching the checkout", () => {
			const root = mkdtempSync(join(tmpdir(), 'cl-primary-'))
			exitedUnit('u1', { worktree: { root, primaryRoot: root } })
			const calls: string[][] = []
			const exec: Exec = (cmd, args) => {
				calls.push([cmd, ...args])
				return null
			}
			const changed = prune({ store, env: {}, exec, now: () => NOW })
			expect(changed.map((r) => [r.id, r.pruned])).toEqual([['u1', 'deleted']])
			expect(loadAgent(store, 'u1')).toBeUndefined()
			expect(existsSync(root)).toBe(true)
			expect(calls.filter((c) => c[3] === 'worktree' && c[4] !== 'prune')).toEqual([])
		})

		it('prune keeps an exited unit whose linked worktree is still on disk', () => {
			const primaryRoot = mkdtempSync(join(tmpdir(), 'cl-primary-'))
			const root = mkdtempSync(join(tmpdir(), 'cl-linked-'))
			exitedUnit('u1', { worktree: { root, primaryRoot } })
			const changed = prune({ store, env: {}, exec: nullExec, now: () => NOW })
			expect(changed).toEqual([])
			expect(loadAgent(store, 'u1')?.status).toBe('exited')
		})

		it('prune deletes a unit it marks exited when the unit has no worktree', () => {
			const rec = register(ctx({ CYBERLEGION_AGENT_ID: 'legacy' }), { handle: 'legacy', harness: 'claude' })
			const changed = prune({ store, env: {}, exec: nullExec, now: () => NOW + 999_999_999 })
			expect(changed.map((r) => [r.id, r.pruned])).toEqual([[rec.id, 'deleted']])
			expect(loadAgent(store, rec.id)).toBeUndefined()
		})

		it('prune leaves the pane pointer of a deleted unit when another unit now holds that pane', () => {
			exitedUnit('dead', { pane: { mux: 'herdr', id: 'w1:p1' } })
			store.putPaneIndex('w1:p2', 'dead')
			store.putPaneIndex('w1:p1', 'live')
			prune({ store, env: {}, exec: nullExec, now: () => NOW })
			expect(store.resolvePaneId('w1:p1')).toBe('live')
		})

		it("prune drops a deleted unit's own pane pointer", () => {
			exitedUnit('dead', { pane: { mux: 'herdr', id: 'w1:p1' } })
			store.putPaneIndex('w1:p1', 'dead')
			prune({ store, env: {}, exec: nullExec, now: () => NOW })
			expect(store.resolvePaneId('w1:p1')).toBeUndefined()
		})

		it("prune clears git's registration of a deleted unit's gone worktree in the recorded repository", () => {
			const primaryRoot = mkdtempSync(join(tmpdir(), 'cl-repo-'))
			exitedUnit('u1', { worktree: { root: join(primaryRoot, 'gone'), primaryRoot } })
			const calls: string[][] = []
			const exec: Exec = (cmd, args) => {
				calls.push([cmd, ...args])
				return null
			}
			prune({ store, env: {}, exec, now: () => NOW })
			expect(calls).toContainEqual(['git', '-C', primaryRoot, 'worktree', 'prune'])
		})

		it('prune never deletes a stopped unit with no worktree', () => {
			exitedUnit('u1', { status: 'stopped' })
			const changed = prune({ store, env: {}, exec: nullExec, now: () => NOW })
			expect(changed).toEqual([])
			expect(loadAgent(store, 'u1')?.status).toBe('stopped')
		})

		describe('a unit that shares a worktree', () => {
			const linked = () => {
				const primaryRoot = mkdtempSync(join(tmpdir(), 'cl-primary-'))
				const root = mkdtempSync(join(tmpdir(), 'cl-linked-'))
				return { root, primaryRoot }
			}

			it("prune keeps an exited sharer that is the last record pointing at a worktree on disk, once the owner's record is gone", () => {
				const wt = linked()
				exitedUnit('sharer', { sharedWorktree: { ...wt, owner: 'gone-owner' } })
				mail('sharer')
				const changed = prune({ store, env: {}, exec: nullExec, now: () => NOW })
				expect(changed).toEqual([])
				expect(loadAgent(store, 'sharer')?.status).toBe('exited')
				expect(store.hasMailbox('sharer')).toBe(true)
			})

			it("prune deletes the last exited sharer of a worktree on disk once that worktree's work has landed", () => {
				const wt = linked()
				exitedUnit('sharer', { sharedWorktree: wt })
				const changed = prune({ store, env: {}, exec: nullExec, now: () => NOW }, { landed: (r) => r === wt.root })
				expect(changed.map((r) => [r.id, r.pruned])).toEqual([['sharer', 'deleted']])
				expect(loadAgent(store, 'sharer')).toBeUndefined()
			})

			it('prune deletes an exited sharer while the owner of its worktree still has a record', () => {
				const wt = linked()
				exitedUnit('owner', { worktree: wt })
				exitedUnit('sharer', { sharedWorktree: { ...wt, owner: 'owner' } })
				const changed = prune({ store, env: {}, exec: nullExec, now: () => NOW })
				expect(changed.map((r) => [r.id, r.pruned])).toEqual([['sharer', 'deleted']])
				expect(loadAgent(store, 'owner')?.status).toBe('exited')
			})

			it('prune keeps exactly one of two exited sharers left pointing at a worktree on disk', () => {
				const wt = linked()
				exitedUnit('s1', { sharedWorktree: wt })
				exitedUnit('s2', { sharedWorktree: wt })
				const changed = prune({ store, env: {}, exec: nullExec, now: () => NOW })
				expect(changed.filter((r) => r.pruned === 'deleted')).toHaveLength(1)
				expect(listAgents(store).map((a) => a.id)).toHaveLength(1)
			})

			it('prune deletes an exited sharer whose shared worktree is gone from disk', () => {
				exitedUnit('sharer', { sharedWorktree: { root: join(tmpdir(), 'cl-no-such-worktree') } })
				const changed = prune({ store, env: {}, exec: nullExec, now: () => NOW })
				expect(changed.map((r) => [r.id, r.pruned])).toEqual([['sharer', 'deleted']])
			})

			it("prune deletes an exited sharer of its repository's primary checkout", () => {
				const root = mkdtempSync(join(tmpdir(), 'cl-primary-'))
				exitedUnit('sharer', { sharedWorktree: { root, primaryRoot: root } })
				const changed = prune({ store, env: {}, exec: nullExec, now: () => NOW })
				expect(changed.map((r) => [r.id, r.pruned])).toEqual([['sharer', 'deleted']])
			})
		})
	})

	describe('reconcile: mux-scoped cull against the live pane set', () => {
		const FRESH = 1_700_000_000_000
		const tmuxListExec =
			(lines: string[]): Exec =>
			(cmd, args) => {
				if (cmd !== 'tmux') return null
				if (tmuxVerb(args) === 'list-panes') return lines.join('\n')
				if (tmuxVerb(args) === 'display-message') return '@1'
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
			const changed = reconcile({ store, env: e, exec: tmuxListExec(['%1 zsh /home']), now: () => FRESH })
			expect(changed.map((r) => r.id)).toContain(rec.id)
			expect(loadAgent(store, rec.id)?.status).toBe('exited')
		})

		it('reconcile marks a record exited from within a herdr session too', () => {
			const e = { HERDR_ENV: '1', HERDR_PANE_ID: 'w3:p4' }
			const rec = register(ctx(e), { handle: 'a', harness: 'claude' })
			const changed = reconcile({
				store,
				env: e,
				exec: herdrListExec([{ pane_id: 'w0:p1', agent: 'claude' }]),
				now: () => FRESH,
			})
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
			withWorktreeOnDisk(rec.id)
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

		it('reconcile culls nothing when the current multiplexer cannot be queried', () => {
			const e = { TMUX: 't', TMUX_PANE: '%7' }
			const rec = register(ctx(e, tmuxListExec(['%7 claude /repo'])), { handle: 'a', harness: 'claude' })
			expect(reconcile({ store, env: e, exec: nullExec, now: () => FRESH })).toEqual([])
			expect(loadAgent(store, rec.id)?.status).toBe('active')
		})

		it('prune reconcile-culls too', () => {
			const e = { TMUX: 't', TMUX_PANE: '%7' }
			const rec = register(ctx(e, tmuxListExec(['%7 claude /repo'])), { handle: 'a', harness: 'claude' })
			withWorktreeOnDisk(rec.id)
			const changed = prune({ store, env: e, exec: tmuxListExec(['%1 zsh /home']), now: () => FRESH })
			expect(changed.map((r) => r.id)).toContain(rec.id)
			expect(loadAgent(store, rec.id)?.status).toBe('exited')
		})
	})

	describe('reconcile: adopt live-but-unregistered panes', () => {
		const FRESH = 1_700_000_000_000
		const herdrListExec =
			(panes: Array<{ pane_id: string; agent?: string; cwd?: string }>): Exec =>
			(cmd, args) => {
				if (cmd !== 'herdr') return null
				if (args[0] === 'pane' && args[1] === 'list') return JSON.stringify({ result: { panes } })
				return null
			}
		const tmuxListExec =
			(lines: string[]): Exec =>
			(cmd, args) => {
				if (cmd !== 'tmux') return null
				if (tmuxVerb(args) === 'list-panes') return lines.join('\n')
				return null
			}
		const herdrEnv = { HERDR_ENV: '1', HERDR_PANE_ID: 'w0:p0' }

		it('reconcile adopts a live herdr pane with a detectable harness and no record', () => {
			const exec = herdrListExec([{ pane_id: 'w3:p9', agent: 'claude', cwd: '/work/repos/feature-x' }])
			const changed = reconcile({ store, env: herdrEnv, exec, now: () => FRESH }, { adopt: true })
			expect(changed).toHaveLength(1)
			const rec = changed[0]!
			expect(rec.harness).toBe('claude')
			expect(rec.status).toBe('active')
			expect(rec.lastSeen).toBe(new Date(FRESH).toISOString())
			expect(store.resolvePaneId('w3:p9')).toBe(rec.id)
			expect(
				listAgents(store)
					.filter((a) => a.status !== 'exited')
					.map((a) => a.id),
			).toContain(rec.id)
		})

		it("an adopted record's handle derives from the pane's reported cwd basename", () => {
			const exec = herdrListExec([{ pane_id: 'w3:p9', agent: 'claude', cwd: '/work/repos/feature-x' }])
			const [rec] = reconcile({ store, env: herdrEnv, exec, now: () => FRESH }, { adopt: true })
			expect(rec?.handle).toBe('feature-x')
		})

		it('an adopted pane with no reported cwd falls back to the id-prefix handle', () => {
			const exec = herdrListExec([{ pane_id: 'w3:p9', agent: 'claude' }])
			const [rec] = reconcile({ store, env: herdrEnv, exec, now: () => FRESH }, { adopt: true })
			expect(rec?.handle).toBe(rec?.id.slice(0, 6))
		})

		it('a pane whose reported agent is not a known harness is never adopted', () => {
			const exec = herdrListExec([{ pane_id: 'w3:p9', agent: 'gemini', cwd: '/work/x' }])
			const changed = reconcile({ store, env: herdrEnv, exec, now: () => FRESH }, { adopt: true })
			expect(changed).toEqual([])
			expect(listAgents(store)).toHaveLength(0)
		})

		it('tmux panes are never adopted because tmux exposes no harness signal', () => {
			const e = { TMUX: 't', TMUX_PANE: '%7' }
			const exec = tmuxListExec(['%7 zsh /work/x', '%9 claude /work/y'])
			const changed = reconcile({ store, env: e, exec, now: () => FRESH }, { adopt: true })
			expect(changed).toEqual([])
			expect(listAgents(store)).toHaveLength(0)
		})

		it('adopt is idempotent — a second reconcile mints no duplicate', () => {
			const exec = herdrListExec([{ pane_id: 'w3:p9', agent: 'claude', cwd: '/work/x' }])
			reconcile({ store, env: herdrEnv, exec, now: () => FRESH }, { adopt: true })
			const again = reconcile({ store, env: herdrEnv, exec, now: () => FRESH }, { adopt: true })
			expect(again).toEqual([])
			expect(listAgents(store)).toHaveLength(1)
		})

		it('a live pane already bound to a registered agent is not re-adopted', () => {
			const rec = register(ctx({ HERDR_ENV: '1', HERDR_PANE_ID: 'w3:p9' }), { handle: 'a', harness: 'claude' })
			const exec = herdrListExec([{ pane_id: 'w3:p9', agent: 'claude', cwd: '/work/x' }])
			const changed = reconcile({ store, env: herdrEnv, exec, now: () => FRESH }, { adopt: true })
			expect(changed).toEqual([])
			expect(listAgents(store)).toHaveLength(1)
			expect(loadAgent(store, rec.id)?.status).toBe('active')
		})

		it('a live pane bound to an exited record is not adopted or resurrected', () => {
			const rec = register(ctx({ HERDR_ENV: '1', HERDR_PANE_ID: 'w3:p9' }), { handle: 'a', harness: 'claude' })
			const dead = loadAgent(store, rec.id)!
			dead.status = 'exited'
			saveAgent(store, dead)
			const exec = herdrListExec([{ pane_id: 'w3:p9', agent: 'claude', cwd: '/work/x' }])
			const changed = reconcile({ store, env: herdrEnv, exec, now: () => FRESH }, { adopt: true })
			expect(changed).toEqual([])
			expect(listAgents(store)).toHaveLength(1)
			expect(loadAgent(store, rec.id)?.status).toBe('exited')
		})

		it('prune never adopts', () => {
			const exec = herdrListExec([{ pane_id: 'w3:p9', agent: 'claude', cwd: '/work/x' }])
			const changed = prune({ store, env: herdrEnv, exec, now: () => FRESH })
			expect(changed).toEqual([])
			expect(listAgents(store)).toHaveLength(0)
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
			const bob = register(
				{ store, env: bobEnv, exec: nullExec, now: () => 1_700_000_000_000 },
				{ handle: 'bob', harness: 'claude' },
			)
			withWorktreeOnDisk(bob.id) // an exited unit with nothing on disk is deleted, not listed
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

		/** Registers a record directly at a chosen status — handles are reused across units over time,
		 * so a live one routinely shares its handle with the dead ones that held it before. */
		const seed = (id: string, handle: string, status: 'active' | 'exited', pane?: string) =>
			saveAgent(store, {
				id,
				handle,
				kind: 'session',
				harness: 'claude',
				cwd: '/repo',
				pane: pane ? { mux: 'tmux', id: pane } : null,
				status,
				createdAt: '2026-07-01T00:00:00.000Z',
				lastSeen: '2026-07-01T00:00:00.000Z',
			})

		it('a handle held by both a live and an exited unit resolves to the live one', () => {
			seed('dead01', 'operator', 'exited', '%4')
			seed('live01', 'operator', 'active', '%9')
			expect(resolveRecipient(store, 'operator')).toBe('live01')
			expect(resolveAgent(store, 'operator').id).toBe('live01')
		})

		it('a handle held only by exited units throws instead of addressing a corpse', () => {
			seed('dead01', 'operator', 'exited', '%4')
			seed('dead02', 'operator', 'exited')
			// The incident shape: mail --to operator silently resolved to an exited unit and was
			// "delivered" to an inbox with no reader. Name the dead units so the cause is legible.
			expect(() => resolveRecipient(store, 'operator')).toThrow(/matches only exited unit\(s\)/)
			expect(() => resolveRecipient(store, 'operator')).toThrow(/dead01 \(%4\), dead02/)
			expect(() => resolveAgent(store, 'operator')).toThrow(/matches only exited unit\(s\)/)
		})

		it('an explicit id still addresses an exited unit — naming it outright is deliberate', () => {
			seed('dead01', 'operator', 'exited', '%4')
			expect(resolveRecipient(store, 'dead01')).toBe('dead01')
			expect(resolveAgent(store, 'dead01').id).toBe('dead01')
		})

		it('a handle two live records share fails loud rather than taking the first', () => {
			seed('live01', 'operator', 'active', '%4')
			seed('live02', 'operator', 'active', '%9')
			// Silently taking the first match could deliver to the wrong unit — make the caller pick.
			expect(() => resolveRecipient(store, 'operator')).toThrow(
				/"operator" names 2 units — pass an id \(live01, live02\)/,
			)
			expect(() => resolveAgent(store, 'operator')).toThrow(/"operator" names 2 units — pass an id \(live01, live02\)/)
			expect(resolveRecipient(store, 'live02')).toBe('live02')
			expect(resolveAgent(store, 'live02').id).toBe('live02')
		})

		it('a standing record still wins a handle that two live sessions also carry', () => {
			seed('live01', 'homa', 'active', '%4')
			seed('live02', 'homa', 'active', '%9')
			const standing = registerStanding(ctx({}), { handle: 'homa' })
			expect(resolveRecipient(store, 'homa')).toBe(standing.id)
			expect(resolveAgent(store, 'homa').id).toBe(standing.id)
		})

		it('a branch ref resolves to the live unit, never an exited one on the same branch', () => {
			const branch = 'cyberlegion/unit-abc'
			saveAgent(store, {
				id: 'dead01',
				handle: 'old',
				kind: 'session',
				harness: 'claude',
				cwd: '/repo',
				pane: null,
				status: 'exited',
				worktree: { root: '/repo', branch },
				createdAt: '2026-07-01T00:00:00.000Z',
				lastSeen: '2026-07-01T00:00:00.000Z',
			})
			saveAgent(store, {
				id: 'live01',
				handle: 'new',
				kind: 'session',
				harness: 'claude',
				cwd: '/repo',
				pane: null,
				status: 'active',
				worktree: { root: '/repo', branch },
				createdAt: '2026-07-01T00:00:00.000Z',
				lastSeen: '2026-07-01T00:00:00.000Z',
			})
			expect(resolveAgent(store, branch).id).toBe('live01')
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
			withWorktreeOnDisk(rec.id)
			const changed = prune({ store, env: {}, exec: nullExec, now: () => 1_700_000_000_000 + 999_999_999 })
			expect(changed.map((r) => r.id)).toContain(rec.id)
			expect(loadAgent(store, rec.id)?.status).toBe('exited')
		})
	})

	describe('standing owner presence', () => {
		// A caller's multiplexer, keyed via the $CYBER_MUX fast-path probeMultiplexer trusts outright
		// ('none' is the override that drives the "reports none" fixture; 'tmux' pairs with
		// $CYBER_MUX_PANE so both probeMultiplexer and currentPane/resolveSelfId agree on the pane).
		const muxEnv = (mux: 'tmux' | 'none', pane = '%1') =>
			mux === 'none' ? { CYBER_MUX: 'none' } : { CYBER_MUX: 'tmux', CYBER_MUX_PANE: pane }

		it("unit claim binds the caller's unit as a standing owner's presence", () => {
			registerStanding(ctx({}), { handle: 'homa' })
			const alice = register(ctx(muxEnv('tmux', '%1')), { handle: 'alice', harness: 'claude' })
			const rec = claimPresence(ctx(muxEnv('tmux', '%1')), 'homa')
			expect(rec.presence).toBe(alice.id)
			expect(resolvePresence(store, 'homa')?.id).toBe(alice.id)
		})

		it('the last claim wins and exactly one unit is the presence', () => {
			registerStanding(ctx({}), { handle: 'homa' })
			register(ctx(muxEnv('tmux', '%1')), { handle: 'alice', harness: 'claude' })
			const bob = register(ctx(muxEnv('tmux', '%2')), { handle: 'bob', harness: 'claude' })
			claimPresence(ctx(muxEnv('tmux', '%1')), 'homa')
			claimPresence(ctx(muxEnv('tmux', '%2')), 'homa')
			expect(resolvePresence(store, 'homa')?.id).toBe(bob.id)
			expect(loadAgent(store, standingId('homa'))?.presence).toBe(bob.id)
		})

		it("claimPresence and clearPresence hold the store's advisory lock around their whole load-mutate-save, keyed per standing record", () => {
			// The genuine read-modify-write race `store/lock.ts` flags by name (load a standing record,
			// mutate `.presence`, save it back) — `setMainPane` already wraps its equivalent in
			// `store.withLock`; this asserts `claimPresence`/`clearPresence` do too, rather than trusting
			// the semantics test above (which can pass by luck on an unlocked but atomic-write store —
			// see the CR report's ablation finding). Wraps the real FileStore so every OTHER Store method
			// still behaves exactly as normal; only `withLock` calls are also recorded.
			registerStanding(ctx({}), { handle: 'homa' })
			register(ctx(muxEnv('tmux', '%1')), { handle: 'alice', harness: 'claude' })
			const calls: string[] = []
			const spyStore: typeof store = new Proxy(store, {
				get(target, prop, receiver) {
					if (prop === 'withLock') {
						return (name: string, fn: () => unknown) => {
							calls.push(name)
							return target.withLock(name, fn)
						}
					}
					return Reflect.get(target, prop, receiver)
				},
			})
			const spyCtx: IdContext = { store: spyStore, env: muxEnv('tmux', '%1'), now: () => 1_700_000_000_000 }
			claimPresence(spyCtx, 'homa')
			expect(calls).toEqual([`presence:${standingId('homa')}`])
			calls.length = 0
			clearPresence({ ...spyCtx, env: {} }, 'homa')
			expect(calls).toEqual([`presence:${standingId('homa')}`])
		})

		it('unit claim --clear unbinds the presence', () => {
			registerStanding(ctx({}), { handle: 'homa' })
			register(ctx(muxEnv('tmux', '%1')), { handle: 'alice', harness: 'claude' })
			claimPresence(ctx(muxEnv('tmux', '%1')), 'homa')
			clearPresence(ctx({}), 'homa')
			expect(resolvePresence(store, 'homa')).toBeUndefined()
		})

		it('unit claim --clear is a no-op when no presence is bound', () => {
			registerStanding(ctx({}), { handle: 'homa' })
			expect(() => clearPresence(ctx({}), 'homa')).not.toThrow()
			expect(resolvePresence(store, 'homa')).toBeUndefined()
		})

		it('clearing a presence for a handle with no standing record throws', () => {
			expect(() => clearPresence(ctx({}), 'homa')).toThrow(/no standing owner "homa"/)
		})

		it('claiming a handle with no standing record throws instead of minting one', () => {
			register(ctx(muxEnv('tmux', '%1')), { handle: 'alice', harness: 'claude' })
			expect(() => claimPresence(ctx(muxEnv('tmux', '%1')), 'homa')).toThrow(/no standing owner "homa"/)
			expect(listAgents(store).some((a) => a.kind === 'standing')).toBe(false)
		})

		it('a presence whose unit has exited reads as no presence bound', () => {
			registerStanding(ctx({}), { handle: 'homa' })
			const alice = register(ctx(muxEnv('tmux', '%1')), { handle: 'alice', harness: 'claude' })
			claimPresence(ctx(muxEnv('tmux', '%1')), 'homa')
			const dead = loadAgent(store, alice.id)!
			dead.status = 'exited'
			saveAgent(store, dead)
			expect(resolvePresence(store, 'homa')).toBeUndefined()
		})

		it('unit claim throws when the caller reports no multiplexer', () => {
			registerStanding(ctx({}), { handle: 'homa' })
			expect(() => claimPresence(ctx(muxEnv('none')), 'homa')).toThrow(/needs a multiplexer to open panes/)
			expect(resolvePresence(store, 'homa')).toBeUndefined()
			expect(loadAgent(store, standingId('homa'))?.presence).toBeUndefined()
		})

		it('unit claim throws when the caller has no self id', () => {
			registerStanding(ctx({}), { handle: 'homa' })
			const alice = register(ctx(muxEnv('tmux', '%1')), { handle: 'alice', harness: 'claude' })
			claimPresence(ctx(muxEnv('tmux', '%1')), 'homa')
			expect(() => claimPresence(ctx(muxEnv('tmux', '%2')), 'homa')).toThrow(/no identity in this session/)
			expect(loadAgent(store, standingId('homa'))?.presence).toBe(alice.id)
		})

		/**
		 * How the caller was REALIZED, as signals a would-be introspective gate could actually branch on
		 * — the harness-detection env markers identity.ts itself already probes, plus the `spawnedBy`
		 * field a derived caller carries on its record. Deliberately disjoint from the probe signal
		 * ($CYBER_MUX): neither marker moves `probeMultiplexer`'s answer, so the two columns of the
		 * Outline vary independently and the invariance across realization is an earned claim.
		 */
		const realizationEnv = (realization: 'a named subagent' | 'a plain session') =>
			realization === 'a named subagent' ? { CLAUDECODE: '1', CLAUDE_CODE_ENTRYPOINT: 'cli' } : {}

		/** Register the caller and realize it: a named subagent's record also carries `spawnedBy`. */
		function realizeCaller(realization: 'a named subagent' | 'a plain session', env: NodeJS.ProcessEnv) {
			const rec = register(ctx(env), { handle: 'caller', harness: 'claude' })
			if (realization === 'a named subagent') {
				saveAgent(store, { ...loadAgent(store, rec.id)!, spawnedBy: 'parent-unit-01' })
			}
			return rec
		}

		// Scenario Outline: the claim tracks the multiplexer probe, never how the caller was realized —
		// the outcome moves with the probe column ONLY. Both realizations carry real subagent-vs-plain
		// signals (spawnedBy + the CLAUDECODE/CLAUDE_CODE_ENTRYPOINT env markers), so an implementation
		// that introspected caller-kind instead of probing capability would fail these rows rather than
		// pass them vacuously.
		it.each([
			['a named subagent', 'tmux', 'binds the caller as homa presence'],
			['a plain session', 'tmux', 'binds the caller as homa presence'],
			['a named subagent', 'none', 'throws that it needs a multiplexer to open panes'],
			['a plain session', 'none', 'throws that it needs a multiplexer to open panes'],
		] as const)('the claim tracks the multiplexer probe (%s, %s) → %s', (realization, probe, _outcome) => {
			registerStanding(ctx({}), { handle: 'homa' })
			const env = { ...muxEnv(probe, '%1'), ...realizationEnv(realization) }
			const caller = realizeCaller(realization, env)
			// Non-vacuity: the realization signals really are on this caller, so a caller-kind gate has
			// something to (wrongly) branch on.
			expect(loadAgent(store, caller.id)?.spawnedBy).toBe(
				realization === 'a named subagent' ? 'parent-unit-01' : undefined,
			)
			if (probe === 'tmux') {
				const rec = claimPresence(ctx(env), 'homa')
				expect(rec.presence).toBe(caller.id)
			} else {
				expect(() => claimPresence(ctx(env), 'homa')).toThrow(/needs a multiplexer to open panes/)
			}
		})

		it('binding a presence neither creates nor requires a bound main pane', () => {
			registerStanding(ctx({}), { handle: 'homa' })
			register(ctx(muxEnv('tmux', '%1')), { handle: 'alice', harness: 'claude' })
			const rec = claimPresence(ctx(muxEnv('tmux', '%1')), 'homa')
			expect(rec.presence).toBeDefined()
			expect(store.getMainPane()).toBeUndefined()
		})
	})
})

describe('spec:cyberlegion/service/lease — owner liveness fails closed', () => {
	const owner = (): AgentRecord => ({
		id: 'owner',
		handle: 'owner',
		harness: 'claude',
		cwd: '/x',
		pane: { mux: 'tmux', id: '%7' },
		status: 'active',
		createdAt: 'x',
		lastSeen: 'x',
	})
	const listing =
		(panes: string | null): Exec =>
		(cmd, args) =>
			cmd === 'tmux' && tmuxVerb(args) === 'list-panes' ? panes : null

	it('a backend the caller cannot reach cannot declare the owner gone', () => {
		expect(sessionLive(ctx({}, listing(null)), owner())).toBe(true)
	})

	it('a reachable backend that lists other panes but not the owner declares it gone', () => {
		expect(sessionLive(ctx({}, listing('%1\tclaude\t/x\t\th\t0')), owner())).toBe(false)
	})

	it('a reachable backend listing the owner pane keeps it live', () => {
		expect(sessionLive(ctx({}, listing('%7\tclaude\t/x\t\th\t0')), owner())).toBe(true)
	})

	it('a stopped owner is never live, even with no pane to probe', () => {
		expect(sessionLive(ctx({}, listing(null)), { ...owner(), status: 'stopped', pane: null })).toBe(false)
	})

	it('an exited owner is never live', () => {
		expect(sessionLive(ctx({}, listing(null)), { ...owner(), status: 'exited' })).toBe(false)
	})
})

describe('resolveUnitMailbox — whose mailbox mail inbox --unit reads', () => {
	const seed = (id: string, handle: string, status: 'active' | 'exited') =>
		saveAgent(store, {
			id,
			handle,
			kind: 'session',
			harness: 'claude',
			cwd: '/repo',
			pane: null,
			status,
			createdAt: '2026-07-01T00:00:00.000Z',
			lastSeen: '2026-07-01T00:00:00.000Z',
		})

	it('resolves a unit by id or by handle', () => {
		seed('live01', 'bob', 'active')
		expect(resolveUnitMailbox(store, 'live01').id).toBe('live01')
		expect(resolveUnitMailbox(store, 'bob').id).toBe('live01')
	})

	it('resolves a handle held only by one exited unit to that unit — a sweep asks about the dead', () => {
		seed('dead01', 'bob', 'exited')
		expect(resolveUnitMailbox(store, 'bob').id).toBe('dead01')
	})

	it('prefers the live holder of a handle over exited ones', () => {
		seed('dead01', 'bob', 'exited')
		seed('live01', 'bob', 'active')
		expect(resolveUnitMailbox(store, 'bob').id).toBe('live01')
	})

	it('fails listing the ids when a handle names several exited units and no live one', () => {
		seed('dead01', 'bob', 'exited')
		seed('dead02', 'bob', 'exited')
		expect(() => resolveUnitMailbox(store, 'bob')).toThrow(/"bob" names 2 exited units — pass an id \(dead01, dead02\)/)
	})

	it('throws on a ref that names no unit', () => {
		expect(() => resolveUnitMailbox(store, 'ghost')).toThrow(/no unit addressable as "ghost" \(tried id and handle\)/)
	})
})

// #272: herdr gives a pane a new id when it moves to another workspace, and keeps its terminal id
// (`herdr pane move wRD:p2 --tab wRE:t1` answered `wRE:p2` with the same `terminal_id`, herdr 0.9.5).
// A herdr pane record carries that terminal id, and prune/reconcile/touch follow it across a move.
describe('spec:cyberlegion/identity — a moved herdr pane keeps its unit', () => {
	const FRESH = 1_700_000_000_000
	type HerdrPane = { pane_id: string; terminal_id: string; agent?: string }
	/** A herdr 0.9.5 that lists `panes` and answers `pane current` / `pane get` from them. */
	const herdrAt =
		(panes: HerdrPane[], current?: string): Exec =>
		(cmd, args) => {
			if (cmd !== 'herdr') return null
			if (args[0] === '--version') return 'herdr 0.9.5'
			const find = (id: string | undefined) => panes.find((p) => p.pane_id === id)
			if (args[0] === 'pane' && args[1] === 'list') return JSON.stringify({ result: { panes } })
			if (args[0] === 'pane' && args[1] === 'read') return find(args[2]) ? '' : null
			if (args[0] === 'pane' && args[1] === 'current') {
				const p = find(current)
				return p ? JSON.stringify({ result: { pane: p, type: 'pane_current' } }) : null
			}
			if (args[0] === 'pane' && args[1] === 'get') {
				const p = find(args[2])
				return p ? JSON.stringify({ result: { pane: p } }) : null
			}
			return null
		}
	const before: HerdrPane[] = [{ pane_id: 'wA:p2', terminal_id: 'term_a', agent: 'claude' }]
	const moved: HerdrPane[] = [{ pane_id: 'wB:p2', terminal_id: 'term_a', agent: 'claude' }]

	function registerInA(): AgentRecord {
		return register(
			{ store, env: { HERDR_ENV: '1', HERDR_PANE_ID: 'wA:p2' }, exec: herdrAt(before, 'wA:p2'), now: () => FRESH },
			{ handle: 'mover', harness: 'claude' },
		)
	}

	it('register in a herdr pane records the pane terminal id', () => {
		expect(registerInA().pane).toEqual({ mux: 'herdr', id: 'wA:p2', terminal: 'term_a' })
	})

	it('prune keeps a unit whose herdr pane moved and follows it to the new pane id', () => {
		const rec = registerInA()
		const changed = prune({ store, env: {}, exec: herdrAt(moved), now: () => FRESH })
		expect(changed).toEqual([])
		expect(loadAgent(store, rec.id)?.status).toBe('active')
		expect(loadAgent(store, rec.id)?.pane).toEqual({ mux: 'herdr', id: 'wB:p2', terminal: 'term_a' })
		expect(store.resolvePaneId('wB:p2')).toBe(rec.id)
		expect(store.resolvePaneId('wA:p2')).toBeUndefined()
	})

	it('reconcile keeps a unit whose herdr pane moved and follows it to the new pane id', () => {
		const rec = registerInA()
		const env = { HERDR_ENV: '1', HERDR_PANE_ID: 'wB:p9' }
		const changed = reconcile({ store, env, exec: herdrAt(moved), now: () => FRESH })
		expect(changed.map((r) => r.id)).not.toContain(rec.id)
		expect(loadAgent(store, rec.id)?.status).toBe('active')
		expect(loadAgent(store, rec.id)?.pane?.id).toBe('wB:p2')
	})

	it('prune marks a unit exited when its herdr pane id now names another terminal', () => {
		const rec = registerInA()
		withWorktreeOnDisk(rec.id)
		const reused: HerdrPane[] = [{ pane_id: 'wA:p2', terminal_id: 'term_other', agent: 'claude' }]
		const changed = prune({ store, env: {}, exec: herdrAt(reused), now: () => FRESH })
		expect(changed.map((r) => r.id)).toContain(rec.id)
		expect(loadAgent(store, rec.id)?.status).toBe('exited')
	})

	it('prune keeps a moved unit whose terminal herdr cannot list', () => {
		const rec = registerInA()
		expect(prune({ store, env: {}, exec: nullExec, now: () => FRESH })).toEqual([])
		expect(loadAgent(store, rec.id)?.status).toBe('active')
	})

	it('touch in a moved herdr pane refreshes the unit pane to the one herdr reports', () => {
		const rec = registerInA()
		const env = { HERDR_ENV: '1', HERDR_PANE_ID: 'wA:p2' }
		touch({ store, env, exec: herdrAt(moved, 'wB:p2'), now: () => FRESH + 60_000 })
		const after = loadAgent(store, rec.id)
		expect(after?.pane).toEqual({ mux: 'herdr', id: 'wB:p2', terminal: 'term_a' })
		expect(after?.lastSeen).toBe(new Date(FRESH + 60_000).toISOString())
		expect(store.resolvePaneId('wB:p2')).toBe(rec.id)
	})

	it('resolveSelfId in a moved herdr pane finds the unit by its terminal', () => {
		const rec = registerInA()
		const env = { HERDR_ENV: '1', HERDR_PANE_ID: 'wA:p2' }
		expect(resolveSelfId({ store, env, exec: herdrAt(moved, 'wB:p2') })).toBe(rec.id)
	})

	it('a herdr record with no terminal id is pruned by its pane id as before', () => {
		const rec = registerInA()
		saveAgent(store, { ...rec, pane: { mux: 'herdr', id: 'wA:p2' } })
		withWorktreeOnDisk(rec.id)
		const changed = prune({ store, env: {}, exec: herdrAt(moved), now: () => FRESH })
		expect(changed.map((r) => r.id)).toContain(rec.id)
		expect(loadAgent(store, rec.id)?.status).toBe('exited')
	})

	it('sessionLive reads a unit whose herdr pane moved as live', () => {
		const rec = registerInA()
		expect(sessionLive({ store, exec: herdrAt(moved) }, rec)).toBe(true)
	})
})

// #284: a device shutdown and herdr resume gives every pane a new terminal id (and may hand pane ids
// out afresh), so neither the pane pointer nor the terminal id finds the unit again. The harness
// conversation id is what survives: herdr resumes the pane with it (`agent_session`), and Claude Code
// carries it as `$CLAUDE_CODE_SESSION_ID`.
describe('spec:cyberlegion/identity — a resumed session keeps its unit', () => {
	const FRESH = 1_700_000_000_000
	type HerdrPane = { pane_id: string; terminal_id: string; agent?: string; agent_session?: unknown }
	const herdrAt =
		(panes: HerdrPane[], current?: string): Exec =>
		(cmd, args) => {
			if (cmd !== 'herdr') return null
			if (args[0] === '--version') return 'herdr 0.9.5'
			const find = (id: string | undefined) => panes.find((p) => p.pane_id === id)
			if (args[0] === 'pane' && args[1] === 'list') return JSON.stringify({ result: { panes } })
			if (args[0] === 'pane' && args[1] === 'current') {
				const p = find(current)
				return p ? JSON.stringify({ result: { pane: p, type: 'pane_current' } }) : null
			}
			if (args[0] === 'pane' && args[1] === 'get') {
				const p = find(args[2])
				return p ? JSON.stringify({ result: { pane: p } }) : null
			}
			return null
		}
	const session = (value: string) => ({ agent: 'claude', kind: 'id', source: 'herdr:claude', value })
	const before: HerdrPane[] = [
		{ pane_id: 'w1:p1', terminal_id: 'term_old', agent: 'claude', agent_session: session('conv-a') },
	]
	const resumed: HerdrPane[] = [
		{ pane_id: 'w1:p1', terminal_id: 'term_new', agent: 'claude', agent_session: session('conv-a') },
	]
	const resumedElsewhere: HerdrPane[] = [
		{ pane_id: 'w7:p3', terminal_id: 'term_new', agent: 'claude', agent_session: session('conv-a') },
	]
	const ctxAt = (panes: HerdrPane[], pane: string, env: NodeJS.ProcessEnv = {}, now = FRESH): IdContext => ({
		store,
		env: { HERDR_ENV: '1', HERDR_PANE_ID: pane, ...env },
		exec: herdrAt(panes, pane),
		now: () => now,
	})

	function registerBefore(): AgentRecord {
		return register(ctxAt(before, 'w1:p1'), { handle: 'operator', harness: 'claude' })
	}

	it('register records the conversation herdr reports for the calling pane', () => {
		expect(registerBefore().conversation).toBe('conv-a')
	})

	it('register records the conversation from $CLAUDE_CODE_SESSION_ID', () => {
		const rec = register(
			{ store, env: { TMUX_PANE: '%5', CLAUDE_CODE_SESSION_ID: 'conv-t' }, exec: nullExec, now: () => FRESH },
			{ handle: 't', harness: 'claude' },
		)
		expect(rec.conversation).toBe('conv-t')
	})

	it('a resumed herdr pane with a new terminal id resolves to the unit that carries its conversation', () => {
		const rec = registerBefore()
		expect(resolveSelfId(ctxAt(resumed, 'w1:p1'))).toBe(rec.id)
	})

	it('a session resumed in a different pane resolves to the unit that carries its conversation', () => {
		const rec = registerBefore()
		expect(resolveSelfId(ctxAt(resumedElsewhere, 'w7:p3'))).toBe(rec.id)
	})

	it('a resumed tmux session resolves by $CLAUDE_CODE_SESSION_ID when its pane has no pointer', () => {
		const rec = register(
			{ store, env: { TMUX_PANE: '%5', CLAUDE_CODE_SESSION_ID: 'conv-t' }, exec: nullExec, now: () => FRESH },
			{ handle: 't', harness: 'claude' },
		)
		expect(resolveSelfId({ store, env: { TMUX_PANE: '%9', CLAUDE_CODE_SESSION_ID: 'conv-t' }, exec: nullExec })).toBe(
			rec.id,
		)
	})

	it('a pane pointer whose unit carries another conversation yields to the unit that carries the caller conversation', () => {
		const rec = registerBefore()
		const other = register(ctxAt(resumedElsewhere, 'w7:p3', { CLAUDE_CODE_SESSION_ID: 'conv-b' }), {
			handle: 'other',
			harness: 'claude',
		})
		expect(other.id).not.toBe(rec.id)
		// herdr hands w7:p3 to the resumed conv-a session; the pointer still names `other`.
		expect(resolveSelfId(ctxAt(resumedElsewhere, 'w7:p3'))).toBe(rec.id)
	})

	it('a pane pointer whose unit carries another conversation still resolves when no unit carries the caller conversation', () => {
		const rec = registerBefore()
		// `/clear` starts a new conversation in the same pane: the unit is still this pane's.
		expect(resolveSelfId(ctxAt(before, 'w1:p1', { CLAUDE_CODE_SESSION_ID: 'conv-new' }))).toBe(rec.id)
	})

	it('register in a resumed session rebinds the existing unit rather than minting one', () => {
		const rec = registerBefore()
		const again = register(ctxAt(resumedElsewhere, 'w7:p3', {}, FRESH + 60_000), { harness: 'claude' })
		expect(again.id).toBe(rec.id)
		expect(again.handle).toBe('operator')
		expect(again.pane).toEqual({ mux: 'herdr', id: 'w7:p3', terminal: 'term_new' })
		expect(store.resolvePaneId('w7:p3')).toBe(rec.id)
		expect(listAgents(store)).toHaveLength(1)
	})

	it('touch in a resumed session heals the unit pane, terminal, and status', () => {
		const rec = registerBefore()
		saveAgent(store, { ...(loadAgent(store, rec.id) as AgentRecord), status: 'exited' })
		touch(ctxAt(resumedElsewhere, 'w7:p3', {}, FRESH + 60_000))
		const after = loadAgent(store, rec.id)
		expect(after?.pane).toEqual({ mux: 'herdr', id: 'w7:p3', terminal: 'term_new' })
		expect(after?.status).toBe('active')
		expect(after?.lastSeen).toBe(new Date(FRESH + 60_000).toISOString())
		expect(store.resolvePaneId('w7:p3')).toBe(rec.id)
		expect(store.resolvePaneId('w1:p1')).toBeUndefined()
	})

	it('touch records the caller conversation on a unit that has none', () => {
		const rec = registerBefore()
		saveAgent(store, { ...(loadAgent(store, rec.id) as AgentRecord), conversation: undefined })
		touch(ctxAt(before, 'w1:p1'))
		expect(loadAgent(store, rec.id)?.conversation).toBe('conv-a')
	})

	it('a standing record that carries a conversation is never resolved as the caller', () => {
		registerStanding({ store, env: {}, exec: nullExec, now: () => FRESH }, { handle: 'homa' })
		const standing = loadAgent(store, standingId('homa')) as AgentRecord
		saveAgent(store, { ...standing, conversation: 'conv-a' })
		expect(resolveSelfId(ctxAt(resumedElsewhere, 'w7:p3'))).toBeUndefined()
	})

	// P2: a resume keeps the pane id and gives it a new terminal; the unit's old terminal is live nowhere.
	// A #272 move is the other way round: the old terminal is still listed, under another pane id.
	const noConversation = (panes: HerdrPane[]) => panes.map(({ agent_session: _, ...p }) => p)

	it('a pane pointer whose unit terminal herdr no longer lists resolves to that unit with no conversation known', () => {
		const rec = register(ctxAt(noConversation(before), 'w1:p1'), { handle: 'operator', harness: 'claude' })
		expect(resolveSelfId(ctxAt(noConversation(resumed), 'w1:p1'))).toBe(rec.id)
	})

	it('a pane pointer whose unit terminal is still live under another pane id resolves to no unit', () => {
		register(ctxAt(noConversation(before), 'w1:p1'), { handle: 'operator', harness: 'claude' })
		const panes = noConversation([
			...resumed.map((p) => ({ ...p, pane_id: 'w1:p1' })),
			{ ...before[0]!, pane_id: 'w9:p9' },
		])
		expect(resolveSelfId(ctxAt(panes, 'w1:p1'))).toBeUndefined()
	})

	it('a pane pointer whose unit terminal herdr cannot list resolves to no unit', () => {
		register(ctxAt(noConversation(before), 'w1:p1'), { handle: 'operator', harness: 'claude' })
		const current = noConversation(resumed)
		const noList: Exec = (cmd, args) =>
			args[0] === 'pane' && args[1] === 'list' ? null : herdrAt(current, 'w1:p1')(cmd, args)
		expect(resolveSelfId({ store, env: { HERDR_ENV: '1', HERDR_PANE_ID: 'w1:p1' }, exec: noList })).toBeUndefined()
	})

	it('touch in a resumed pane whose unit terminal herdr no longer lists records the new terminal id', () => {
		const rec = register(ctxAt(noConversation(before), 'w1:p1'), { handle: 'operator', harness: 'claude' })
		touch(ctxAt(noConversation(resumed), 'w1:p1', {}, FRESH + 60_000))
		expect(loadAgent(store, rec.id)?.pane).toEqual({ mux: 'herdr', id: 'w1:p1', terminal: 'term_new' })
		expect(store.resolvePaneId('w1:p1')).toBe(rec.id)
	})
})

// #241: herdr pane ids are scoped to one herdr server, so `w1:p1` exists in every herdr session; tmux
// pane ids are scoped to one tmux server. A pane record names the server its pane lives on (`server`:
// herdr's `$HERDR_SOCKET_PATH`, tmux's socket from `$TMUX`) and that server's session name (`session`),
// so a sweep can act on the units in its own multiplexer server only.
describe('spec:cyberlegion/identity — a pane record names its multiplexer server', () => {
	const SOCK = '/home/u/.config/herdr/herdr.sock'
	const herdrScoped: Exec = (cmd, args) => {
		if (cmd !== 'herdr') return null
		if (args[0] === 'session' && args[1] === 'list') {
			return JSON.stringify({
				sessions: [
					{ name: 'work', socket_path: '/home/u/.config/herdr/sessions/work/herdr.sock' },
					{ name: 'default', socket_path: SOCK },
				],
			})
		}
		return null
	}
	const inHerdr = (pane: string, socket: string | null = SOCK): NodeJS.ProcessEnv => ({
		HERDR_ENV: '1',
		HERDR_PANE_ID: pane,
		...(socket ? { HERDR_SOCKET_PATH: socket } : {}),
	})
	const tmuxScoped: Exec = (cmd, args) =>
		cmd === 'tmux' && args.includes('#{session_name}')
			? 'main'
			: cmd === 'tmux' && args.includes('#{window_id}')
				? '@2'
				: null
	const inTmux = (pane: string, socket = '/tmp/tmux-1000/default'): NodeJS.ProcessEnv => ({
		TMUX: `${socket},123,0`,
		TMUX_PANE: pane,
	})

	it('register in a herdr pane records the herdr socket as the server and its session name', () => {
		const rec = register(ctx(inHerdr('w1:p1'), herdrScoped), { handle: 'a', harness: 'claude' })
		expect(rec.pane).toEqual({ mux: 'herdr', id: 'w1:p1', server: SOCK, session: 'default' })
	})

	it('register in a herdr pane whose session herdr does not list records the server alone', () => {
		const rec = register(ctx(inHerdr('w1:p1', '/elsewhere.sock'), herdrScoped), { handle: 'a', harness: 'claude' })
		expect(rec.pane).toEqual({ mux: 'herdr', id: 'w1:p1', server: '/elsewhere.sock' })
	})

	it('register in a herdr pane with no socket in the env records no server', () => {
		const rec = register(ctx(inHerdr('w1:p1', null), herdrScoped), { handle: 'a', harness: 'claude' })
		expect(rec.pane).toEqual({ mux: 'herdr', id: 'w1:p1' })
	})

	it('register in a tmux pane records the tmux socket as the server and the tmux session name', () => {
		const rec = register(ctx(inTmux('%3'), tmuxScoped), { handle: 'a', harness: 'claude' })
		expect(rec.pane).toEqual({ mux: 'tmux', id: '%3', window: '@2', server: '/tmp/tmux-1000/default', session: 'main' })
	})

	it('a pane a spawn opened in herdr records the spawner server and its session name', () => {
		expect(openedPaneLocator(herdrScoped, 'herdr', 'w2:p3', inHerdr('w1:p1'))).toEqual({
			mux: 'herdr',
			id: 'w2:p3',
			server: SOCK,
			session: 'default',
		})
	})

	it('a pane a spawn opened in tmux records the spawner server and the new pane session name', () => {
		expect(openedPaneLocator(tmuxScoped, 'tmux', '%7', inTmux('%3'))).toEqual({
			mux: 'tmux',
			id: '%7',
			server: '/tmp/tmux-1000/default',
			session: 'main',
		})
	})

	it('touch records the server on the caller unit whose pane record has none', () => {
		const rec = register(ctx(inHerdr('w1:p1', null), herdrScoped), { handle: 'a', harness: 'claude' })
		touch(ctx(inHerdr('w1:p1'), herdrScoped))
		expect(loadAgent(store, rec.id)?.pane).toEqual({ mux: 'herdr', id: 'w1:p1', server: SOCK, session: 'default' })
	})

	describe('onCallerServer — the units on the caller multiplexer server', () => {
		function seed(id: string, pane: AgentRecord['pane']): void {
			saveAgent(store, {
				id,
				handle: id,
				harness: 'claude',
				cwd: '/x',
				pane,
				status: 'active',
				createdAt: 't',
				lastSeen: 't',
			})
		}

		it('keeps a unit on the caller server and drops units on another server, another mux, unknown, or no pane', () => {
			seed('here', { mux: 'herdr', id: 'w1:p1', server: SOCK })
			seed('other-session', { mux: 'herdr', id: 'w1:p1', server: '/other.sock' })
			seed('tmux', { mux: 'tmux', id: '%1', server: SOCK })
			seed('unknown', { mux: 'herdr', id: 'w1:p2' })
			seed('paneless', null)
			const keep = onCallerServer(ctx(inHerdr('w9:p9'), herdrScoped))
			expect(
				listAgents(store)
					.filter(keep)
					.map((a) => a.id),
			).toEqual(['here'])
		})

		it('throws for a caller in no multiplexer pane', () => {
			expect(() => onCallerServer(ctx({}, nullExec))).toThrow(/tmux or herdr pane/)
		})

		it('throws for a caller whose multiplexer server is unknown', () => {
			expect(() => onCallerServer(ctx(inHerdr('w1:p1', null), herdrScoped))).toThrow(/server/)
		})
	})
})

// #242: where hooks cannot run, nothing records a unit's `conversation`. herdr already reports it for
// every Claude pane (`agent_session`), and it is the id herdr resumes the pane with, so one `herdr pane
// list` read fills it in for every live herdr unit that has none. A pane is matched by its terminal id,
// never its pane id, since pane ids recur.
describe('spec:cyberlegion/identity — a unit conversation is filled from herdr', () => {
	const SOCK = '/s/herdr.sock'
	const session = (value: string) => ({ agent: 'claude', kind: 'id', source: 'herdr:claude', value })
	type HerdrPane = { pane_id: string; terminal_id: string; agent_session?: unknown }
	const listed: HerdrPane[] = [
		{ pane_id: 'w1:p1', terminal_id: 'term_a', agent_session: session('conv-a') },
		{ pane_id: 'w1:p2', terminal_id: 'term_b', agent_session: session('conv-b') },
		{ pane_id: 'w1:p3', terminal_id: 'term_c' },
	]
	function herdrListing(panes: HerdrPane[] | null) {
		const calls: string[][] = []
		const exec: Exec = (cmd, args) => {
			calls.push([cmd, ...args])
			if (cmd === 'herdr' && args[0] === 'pane' && args[1] === 'list') {
				return panes ? JSON.stringify({ result: { panes } }) : null
			}
			return null
		}
		return { exec, lists: () => calls.filter((c) => c[1] === 'pane' && c[2] === 'list').length }
	}
	const caller = { HERDR_ENV: '1', HERDR_PANE_ID: 'w9:p9', HERDR_SOCKET_PATH: SOCK }
	function seed(id: string, extra: Partial<AgentRecord> = {}): void {
		saveAgent(store, {
			id,
			handle: id,
			harness: 'claude',
			cwd: '/x',
			pane: { mux: 'herdr', id: 'w1:p1', terminal: 'term_a' },
			status: 'active',
			createdAt: 't',
			lastSeen: 't',
			...extra,
		})
	}

	it('fills the conversation herdr reports for the terminal of a unit that has none', () => {
		seed('a')
		seed('b', { pane: { mux: 'herdr', id: 'w1:p2', terminal: 'term_b', server: SOCK } })
		fillConversations(ctx(caller, herdrListing(listed).exec))
		expect(loadAgent(store, 'a')?.conversation).toBe('conv-a')
		expect(loadAgent(store, 'b')?.conversation).toBe('conv-b')
	})

	it('reads the herdr pane list once for every unit', () => {
		seed('a')
		seed('b', { pane: { mux: 'herdr', id: 'w1:p2', terminal: 'term_b' } })
		const h = herdrListing(listed)
		fillConversations(ctx(caller, h.exec))
		expect(h.lists()).toBe(1)
	})

	it('keeps a conversation the unit already carries', () => {
		seed('a', { conversation: 'conv-hook' })
		fillConversations(ctx(caller, herdrListing(listed).exec))
		expect(loadAgent(store, 'a')?.conversation).toBe('conv-hook')
	})

	it('leaves a unit with no conversation when herdr reports none for its terminal', () => {
		seed('c', { pane: { mux: 'herdr', id: 'w1:p3', terminal: 'term_c' } })
		fillConversations(ctx(caller, herdrListing(listed).exec))
		expect(loadAgent(store, 'c')?.conversation).toBeUndefined()
	})

	it('never matches a unit by its pane id alone', () => {
		seed('a', { pane: { mux: 'herdr', id: 'w1:p1' } })
		fillConversations(ctx(caller, herdrListing(listed).exec))
		expect(loadAgent(store, 'a')?.conversation).toBeUndefined()
	})

	it('never fills a unit whose record names another server', () => {
		seed('a', { pane: { mux: 'herdr', id: 'w1:p1', terminal: 'term_a', server: '/other.sock' } })
		fillConversations(ctx(caller, herdrListing(listed).exec))
		expect(loadAgent(store, 'a')?.conversation).toBeUndefined()
	})

	it('never fills an exited unit or a standing record', () => {
		seed('gone', { status: 'exited' })
		seed('owner', { kind: 'standing' })
		fillConversations(ctx(caller, herdrListing(listed).exec))
		expect(loadAgent(store, 'gone')?.conversation).toBeUndefined()
		expect(loadAgent(store, 'owner')?.conversation).toBeUndefined()
	})

	it('reads nothing from herdr when no unit lacks a conversation', () => {
		seed('a', { conversation: 'conv-hook' })
		const h = herdrListing(listed)
		fillConversations(ctx(caller, h.exec))
		expect(h.lists()).toBe(0)
	})

	it('reads nothing from herdr for a caller outside a herdr pane', () => {
		seed('a')
		const h = herdrListing(listed)
		fillConversations(ctx({ TMUX: '/tmp/t,1,0', TMUX_PANE: '%1' }, h.exec))
		expect(h.lists()).toBe(0)
		expect(loadAgent(store, 'a')?.conversation).toBeUndefined()
	})

	it('changes nothing when herdr gives no pane list', () => {
		seed('a')
		fillConversations(ctx(caller, herdrListing(null).exec))
		expect(loadAgent(store, 'a')?.conversation).toBeUndefined()
	})
})
