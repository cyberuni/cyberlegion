import { existsSync, mkdirSync, mkdtempSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AcquireOptions } from '@cyberuni/agent-harness/worktrees'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { stripControl } from './background.ts'
import { DELIVERY_DOORBELL, spawnDoorbell } from './console/doorbell.ts'
import { decommission } from './decommission.ts'
import { type FakeClaudeOptions, fakeClaude, listed, stubClaudeBinary } from './fake-claude.test-util.ts'
import { type AgentRecord, type Exec, type IdContext, loadAgent, saveAgent } from './identity.ts'
import { paths } from './paths.ts'
import { clearUnit, focusUnit, nudgeUnit, readUnit, spawnAndWake } from './session.ts'
import { FileStore } from './store/file-store.ts'
import { rebindUnit, restartUnit, showUnit, stopUnit } from './unit-runtime.ts'

// spec: unit/background/background.feature — one test per frozen scenario, each quoting its title.
// Level: boundary. Claude Code is stood in for at the `Exec` seam (`fake-claude.test-util.ts`), the
// way every other backend's tests stand in for tmux and herdr: a real `claude --bg` starts a session
// that runs and costs money, so no test starts one. The spawn scenarios about how the session is
// launched (folder, environment, name, flags, prompt) go one level higher: the start line runs in a
// real shell against a stub `claude` executable that records what it was started with.

/** The worktree library, stood in for: no real repository is behind these tests' faked git. */
const leases = vi.hoisted(() => ({ acquired: [] as AcquireOptions[], released: [] as unknown[] }))
vi.mock('./worktree-lease.ts', async (importOriginal) => {
	const original = await importOriginal<typeof import('./worktree-lease.ts')>()
	return {
		...original,
		libraryLeases: {
			async acquire(options: AcquireOptions) {
				leases.acquired.push(options)
				const path = `${options.primaryRoot}.worktrees/slot-1`
				mkdirSync(path, { recursive: true })
				return {
					worktree: path,
					leaseId: 'lease-1',
					holder: options.holder,
					reused: false,
					verified: true,
					lingering: [],
				}
			},
			async release(lease: unknown) {
				leases.released.push(lease)
				return { released: true }
			},
		},
	}
})

let tmp: string
let store: FileStore
let primaryRoot: string

beforeEach(() => {
	tmp = realpathSync(mkdtempSync(join(tmpdir(), 'cl-bg-')))
	store = new FileStore(join(tmp, 'hub'))
	primaryRoot = join(tmp, 'repo')
	mkdirSync(primaryRoot)
	leases.acquired.length = 0
	leases.released.length = 0
})
afterEach(() => {
	vi.unstubAllEnvs()
})

/** git as spawn and close ask it: the primary checkout, a clean status, and worktree calls that succeed
 * unless a test says otherwise. */
function git(o: { dirty?: boolean; removeFails?: string } = {}): Exec {
	const exec: Exec = (cmd, args) => {
		exec.lastError = undefined
		if (cmd !== 'git') return null
		if (args.includes('--git-common-dir')) return `${primaryRoot}/.git`
		if (args.includes('status')) return o.dirty ? ' M src/tracked.ts' : ''
		if (args.includes('worktree') && args.includes('remove') && o.removeFails) {
			exec.lastError = o.removeFails
			return null
		}
		if (args.includes('worktree')) return ''
		return null
	}
	return exec
}

/** A caller in no multiplexer: no mux variables, and an ancestry walk (`ps`) that finds none. */
function noMux(exec: Exec, extra: Partial<IdContext> = {}): IdContext {
	return { store, env: {}, exec, now: () => 1_700_000_000_000, ...extra }
}

/** A unit already hosted in a background session. */
function bgUnit(over: Partial<AgentRecord> = {}): AgentRecord {
	const cwd = join(tmp, 'unit-folder')
	mkdirSync(cwd, { recursive: true })
	const rec: AgentRecord = {
		id: 'u1',
		handle: 'ledger-audit',
		harness: 'claude',
		cwd,
		worktree: null,
		pane: { mux: 'claude-bg', id: '9f8e7d6c' },
		status: 'active',
		createdAt: '2026-01-01T00:00:00.000Z',
		lastSeen: '2026-01-01T00:00:00.000Z',
		brief: paths.briefFile(store.root, 'u1'),
		...over,
	}
	saveAgent(store, rec)
	return rec
}

function bgCtx(o: FakeClaudeOptions, env: NodeJS.ProcessEnv = {}) {
	const fake = fakeClaude({ other: git(), ...o })
	return { fake, ctx: { store, env, exec: fake.exec, now: () => 1_700_000_000_000 } as IdContext }
}

const unitRecords = () => store.listAgents()

describe('spec:cyberlegion/unit/background', () => {
	describe('unit spawn', () => {
		it("a background spawn starts the session in the unit's folder with the spawn wake as its first prompt", async () => {
			const stub = stubClaudeBinary('a1b2c3d4')
			vi.stubEnv('PATH', `${stub.dir}:${process.env.PATH}`)
			const fake = fakeClaude({ other: git(), realShell: true })
			const res = await spawnAndWake(noMux(fake.exec), {
				harness: 'claude',
				task: 'prune stale cache keys from the session store',
			})
			const seen = stub.seen()
			// a claude --bg command ran with the unit's worktree as its working directory
			expect(fake.starts()).toHaveLength(1)
			expect(seen.args).toContain('--bg')
			expect(seen.cwd).toBe(res.agent.worktree?.root)
			// its prompt is the spawn wake naming the unit's brief file path
			expect(res.agent.brief).toBe(paths.briefFile(store.root, res.agent.id))
			expect(seen.args.at(-1)).toBe(spawnDoorbell(res.agent.brief as string))
			// the brief is on disk before the session's first turn reads it
			expect(store.readBrief(res.agent.id)).toBe('prune stale cache keys from the session store')
			expect(res.rung).toBe(true)
			expect(fake.claude().some(([sub]) => sub === 'stop')).toBe(false)
			expect(fake.claude().some((c) => c[0] === '--bg' && c[1] === '--resume')).toBe(false)
		})

		it("a background spawn records the printed short id on the unit's record", async () => {
			const { fake, ctx } = bgCtx({ start: { stdout: 'backgrounded · 9f8e7d6c · tidy-imports' } })
			const res = await spawnAndWake(ctx, { harness: 'claude', task: 'tidy imports' })
			expect(fake.starts()).toHaveLength(1)
			expect(loadAgent(store, res.agent.id)?.pane).toEqual({ mux: 'claude-bg', id: '9f8e7d6c' })
		})

		it("a background spawn starts the session with the unit's id and the CLI shim in its environment", async () => {
			const stub = stubClaudeBinary('a1b2c3d4')
			vi.stubEnv('PATH', `${stub.dir}:${process.env.PATH}`)
			const fake = fakeClaude({ other: git(), realShell: true })
			const self = ['/usr/bin/node', '/opt/cyberlegion/dist/cli.mjs']
			const res = await spawnAndWake(noMux(fake.exec, { self }), { harness: 'claude', task: 't' })
			const seen = stub.seen()
			expect(seen.id).toBe(res.agent.id)
			const shimDir = join(paths.dataDir(store.root, res.agent.id), 'bin')
			expect(seen.path.split(':')[0]).toBe(shimDir)
			expect(existsSync(join(shimDir, 'cyberlegion'))).toBe(true)
		})

		it("a background spawn names the session after the unit's handle", async () => {
			const stub = stubClaudeBinary('a1b2c3d4')
			vi.stubEnv('PATH', `${stub.dir}:${process.env.PATH}`)
			const fake = fakeClaude({ other: git(), realShell: true })
			await spawnAndWake(noMux(fake.exec), { harness: 'claude', task: 't', handle: 'ledger-audit' })
			const args = stub.seen().args
			expect(args[args.indexOf('--name') + 1]).toBe('ledger-audit')
		})

		it('a background spawn opens no multiplexer space whatever --at names', async () => {
			const { fake, ctx } = bgCtx({})
			const res = await spawnAndWake(ctx, { harness: 'claude', task: 't', at: 'pane:right' })
			expect(fake.starts()).toHaveLength(1)
			expect(res.agent.pane?.mux).toBe('claude-bg')
			expect(fake.muxCalls()).toEqual([])
		})

		it('a background spawn refuses --no-wake before creating anything', async () => {
			const { fake, ctx } = bgCtx({})
			await expect(spawnAndWake(ctx, { harness: 'claude', task: 't' }, { noWake: true })).rejects.toThrow(
				/--no-wake.*unsupported.*background session/,
			)
			expect(leases.acquired).toEqual([])
			expect(fake.calls.some((c) => c[0] === 'git' && c.includes('worktree'))).toBe(false)
			expect(fake.starts()).toEqual([])
			expect(unitRecords()).toEqual([])
		})

		it('a background spawn refuses a launch that is not the claude command before creating anything', async () => {
			const { fake, ctx } = bgCtx({})
			await expect(
				spawnAndWake(ctx, { harness: 'claude', task: 't', command: 'my-claude-wrapper --profile ops' }),
			).rejects.toThrow(/launch "my-claude-wrapper --profile ops" is not the claude command/)
			expect(leases.acquired).toEqual([])
			expect(fake.calls.some((c) => c[0] === 'git' && c.includes('worktree'))).toBe(false)
			expect(fake.starts()).toEqual([])
			expect(unitRecords()).toEqual([])
		})

		it('a background spawn accepts a launch command that runs claude with its own flags', async () => {
			const stub = stubClaudeBinary('a1b2c3d4')
			vi.stubEnv('PATH', `${stub.dir}:${process.env.PATH}`)
			const fake = fakeClaude({ other: git(), realShell: true })
			const res = await spawnAndWake(noMux(fake.exec), { harness: 'claude', task: 't', command: 'claude --model opus' })
			const args = stub.seen().args
			expect(args).toContain('--bg')
			expect(args[args.indexOf('--model') + 1]).toBe('opus')
			expect(loadAgent(store, res.agent.id)?.pane?.mux).toBe('claude-bg')
		})

		it('a background spawn into an untrusted folder releases its worktree and registers nothing', async () => {
			const { ctx } = bgCtx({
				start: { stderr: 'Workspace not trusted. Run claude in this folder once and accept the trust prompt.' },
			})
			const err = await spawnAndWake(ctx, { harness: 'claude', task: 't' }).catch((e: Error) => e)
			const worktree = `${primaryRoot}.worktrees/slot-1`
			expect(err).toBeInstanceOf(Error)
			expect((err as Error).message).toContain(`does not trust ${worktree}`)
			expect(leases.released).toEqual([
				expect.objectContaining({ worktree, leaseId: 'lease-1', holder: leases.acquired[0]?.holder }),
			])
			expect(unitRecords()).toEqual([])
		})

		it('a --cwd background spawn into an untrusted folder registers nothing and names the folder', async () => {
			const folder = join(tmp, 'existing-folder')
			mkdirSync(folder)
			const { ctx } = bgCtx({ start: { stderr: 'Workspace not trusted. Run claude here once to trust it.' } })
			await expect(spawnAndWake(ctx, { harness: 'claude', task: 't', cwd: folder })).rejects.toThrow(
				`does not trust ${folder}`,
			)
			expect(unitRecords()).toEqual([])
			expect(existsSync(folder)).toBe(true)
		})

		it('a background session that fails to start releases the worktree and registers nothing', async () => {
			const { ctx } = bgCtx({ start: { stderr: 'background service unavailable' } })
			await expect(spawnAndWake(ctx, { harness: 'claude', task: 't' })).rejects.toThrow(
				'background service unavailable',
			)
			expect(leases.released).toHaveLength(1)
			expect(unitRecords()).toEqual([])
		})

		it('a background spawn whose output names no session releases the worktree and registers nothing', async () => {
			const { ctx } = bgCtx({ start: { stdout: 'Starting background service…' } })
			await expect(spawnAndWake(ctx, { harness: 'claude', task: 't' })).rejects.toThrow('Starting background service…')
			expect(leases.released).toHaveLength(1)
			expect(unitRecords()).toEqual([])
		})
	})

	describe('unit nudge', () => {
		it('nudge on an idle background unit resumes it with the message as its next prompt', async () => {
			bgUnit()
			const { fake, ctx } = bgCtx({
				listing: [
					{ id: '9f8e7d6c', sessionId: '9f8e7d6c-1111-4222-8333-444455556666', status: 'idle', state: 'working' },
				],
				resume: () => ({ stdout: 'note: woke session 9f8e7d6c with a new prompt' }),
			})
			const res = await nudgeUnit(ctx, 'ledger-audit', { message: 'rebase onto main' })
			const claude = fake.claude()
			const stop = claude.findIndex((c) => c[0] === 'stop' && c[1] === '9f8e7d6c')
			const resume = claude.findIndex(
				(c) =>
					c[0] === '--bg' &&
					c[1] === '--resume' &&
					c[2] === '9f8e7d6c-1111-4222-8333-444455556666' &&
					c[3] === 'rebase onto main',
			)
			expect(stop).toBeGreaterThanOrEqual(0)
			expect(resume).toBeGreaterThan(stop)
			expect(res.message).toBe('rebase onto main')
		})

		it('nudge with no message rings an idle background unit with the default check-mail message', async () => {
			bgUnit()
			const session = listed('9f8e7d6c', { status: 'idle', state: 'done' })
			const { fake, ctx } = bgCtx({ listing: [session] })
			await nudgeUnit(ctx, 'ledger-audit')
			expect(fake.claude()).toContainEqual(['--bg', '--resume', session.sessionId, DELIVERY_DOORBELL])
		})

		it('nudge fails loud when the resume starts a copy instead of waking the unit', async () => {
			bgUnit()
			const { ctx } = bgCtx({
				listing: [listed('9f8e7d6c', { status: 'idle', state: 'done' })],
				resume: () => ({ stdout: 'note: started a copy of session 9f8e7d6c as 0a0b0c0d' }),
			})
			await expect(nudgeUnit(ctx, 'ledger-audit')).rejects.toThrow(/not woken/)
		})

		it('nudge fails loud and resumes nothing when the stop fails', async () => {
			bgUnit()
			const { fake, ctx } = bgCtx({
				listing: [listed('9f8e7d6c', { status: 'idle', state: 'done' })],
				stop: { stderr: 'stop refused: EPERM' },
			})
			await expect(nudgeUnit(ctx, 'ledger-audit')).rejects.toThrow('stop refused: EPERM')
			expect(fake.claude().some((c) => c[1] === '--resume')).toBe(false)
		})

		it('nudge on a busy background unit reports it busy and leaves the session running', async () => {
			bgUnit()
			const { fake, ctx } = bgCtx({ listing: [listed('9f8e7d6c', { status: 'busy', state: 'working' })] })
			await expect(nudgeUnit(ctx, 'ledger-audit')).rejects.toThrow(/busy.*not rung/)
			expect(fake.claude().some(([sub]) => sub === 'stop')).toBe(false)
		})

		it('nudge on a blocked background unit reports it waiting on a person and leaves it untouched', async () => {
			bgUnit()
			const { fake, ctx } = bgCtx({ listing: [listed('9f8e7d6c', { status: 'idle', state: 'blocked' })] })
			await expect(nudgeUnit(ctx, 'ledger-audit')).rejects.toThrow(/waiting on a person.*claude attach 9f8e7d6c/)
			expect(fake.claude().some(([sub]) => sub === 'stop')).toBe(false)
		})

		it.each(['failed', 'done'] as const)(
			'nudge on a background session reporting neither busy nor idle fails and stops nothing (state %s)',
			async (state) => {
				bgUnit()
				const { fake, ctx } = bgCtx({ listing: [listed('9f8e7d6c', { state })] })
				await expect(nudgeUnit(ctx, 'ledger-audit')).rejects.toThrow(/not idle.*not rung/)
				expect(fake.claude().some(([sub]) => sub === 'stop')).toBe(false)
			},
		)

		it('nudge on a background unit whose session is gone fails naming it', async () => {
			bgUnit()
			const { fake, ctx } = bgCtx({ listing: [listed('0a0b0c0d', { status: 'idle', state: 'done' })] })
			await expect(nudgeUnit(ctx, 'ledger-audit')).rejects.toThrow(/9f8e7d6c.*no longer exists/)
			expect(fake.claude().some(([sub]) => sub === 'stop')).toBe(false)
		})

		it("nudge fails and stops nothing when Claude Code's listing cannot be read", async () => {
			bgUnit()
			const { fake, ctx } = bgCtx({ listing: 'unreadable' })
			await expect(nudgeUnit(ctx, 'ledger-audit')).rejects.toThrow(/could not read the state/)
			expect(fake.claude().some(([sub]) => sub === 'stop')).toBe(false)
		})

		it('nudge on a stopped background unit is refused and runs no Claude command', async () => {
			bgUnit({ status: 'stopped' })
			const { fake, ctx } = bgCtx({ listing: [listed('9f8e7d6c', { state: 'stopped' })] })
			await expect(nudgeUnit(ctx, 'ledger-audit')).rejects.toThrow(/is stopped/)
			expect(fake.claude()).toEqual([])
		})
	})

	describe('unit read', () => {
		it("read prints a background unit's log without control sequences, bounded by --lines", () => {
			bgUnit()
			const ESC = '\x1b'
			const raw = Array.from(
				{ length: 30 },
				(_, i) => `${ESC}[1;32mline ${i + 1}${ESC}[0m ${ESC}[2K${ESC}]0;title ${i}\x07done${ESC}[?25h`,
			).join('\r\n')
			const { fake, ctx } = bgCtx({ logs: { stdout: raw } })
			const { output } = readUnit(ctx, 'ledger-audit', { lines: 5 })
			expect(fake.claude()).toEqual([['logs', '9f8e7d6c']])
			expect(output.split('\n')).toEqual(Array.from({ length: 5 }, (_, i) => `line ${26 + i} done`))
			expect(output).not.toContain(ESC)
		})

		it('read on a background unit whose log cannot be read fails naming the session', () => {
			bgUnit()
			const { ctx } = bgCtx({ logs: { stderr: 'no session 9f8e7d6c' } })
			const log = vi.spyOn(console, 'log')
			expect(() => readUnit(ctx, 'ledger-audit')).toThrow(/9f8e7d6c/)
			expect(log).not.toHaveBeenCalled()
			log.mockRestore()
		})
	})

	describe('unit show', () => {
		it('show reports a running background unit live with the controls that work on it', () => {
			bgUnit()
			const { ctx } = bgCtx({ listing: [listed('9f8e7d6c', { status: 'busy', state: 'working' })] })
			const view = showUnit(ctx, 'ledger-audit')
			expect(view.pane?.mux).toBe('claude-bg')
			expect(view.liveness).toBe('live')
			expect(view.controls).toEqual(['nudge', 'read', 'stop', 'close'])
		})

		it('show reports a background unit gone when the listing does not contain it', () => {
			bgUnit()
			const { ctx } = bgCtx({ listing: [listed('0a0b0c0d', { status: 'busy', state: 'working' })] })
			const view = showUnit(ctx, 'ledger-audit')
			expect(view.liveness).toBe('gone')
			expect(view.controls).toEqual(['close'])
		})

		it('show offers only close for a stopped background unit', () => {
			bgUnit({ status: 'stopped' })
			const { fake, ctx } = bgCtx({ listing: [listed('9f8e7d6c', { state: 'stopped' })] })
			const view = showUnit(ctx, 'ledger-audit')
			expect(view.liveness).toBe('stopped')
			expect(view.controls).toEqual(['close'])
			expect(fake.claude().some(([sub]) => sub === 'agents')).toBe(false)
		})

		it("show reports a background unit's liveness unknown when the listing cannot be read", () => {
			bgUnit()
			const { ctx } = bgCtx({ listing: 'unreadable' })
			const view = showUnit(ctx, 'ledger-audit')
			expect(view.liveness).toBe('unknown')
			expect(view.controls).toEqual(['close'])
		})
	})

	describe('unit stop', () => {
		it('stop on a background unit stops the session and keeps its conversation and locator', () => {
			bgUnit()
			const { fake, ctx } = bgCtx({
				listing: [listed('9f8e7d6c', { status: 'idle', state: 'done' })],
				listingAfterStop: [listed('9f8e7d6c', { state: 'done' })],
			})
			const res = stopUnit(ctx, 'ledger-audit')
			expect(fake.claude()).toContainEqual(['stop', '9f8e7d6c'])
			expect(fake.claude().some(([sub]) => sub === 'rm')).toBe(false)
			const rec = loadAgent(store, 'u1')
			expect(rec?.status).toBe('stopped')
			expect(rec?.pane).toEqual({ mux: 'claude-bg', id: '9f8e7d6c' })
			expect(res.verified).toBe(true)
		})

		it('stop verifies a background session stopped mid-turn', () => {
			bgUnit()
			const { ctx } = bgCtx({
				listing: [listed('9f8e7d6c', { status: 'busy', state: 'working' })],
				listingAfterStop: [listed('9f8e7d6c', { state: 'stopped' })],
			})
			const res = stopUnit(ctx, 'ledger-audit')
			expect(loadAgent(store, 'u1')?.status).toBe('stopped')
			expect(res.verified).toBe(true)
		})

		it('stop on a background unit whose session is gone marks it stopped', () => {
			bgUnit()
			const { ctx } = bgCtx({ listing: [], stop: { stderr: 'no session 9f8e7d6c' } })
			const res = stopUnit(ctx, 'ledger-audit')
			expect(loadAgent(store, 'u1')?.status).toBe('stopped')
			expect(res.verified).toBe(true)
		})

		it('stop fails loud when the background session is still running after the stop', () => {
			bgUnit()
			const { ctx } = bgCtx({
				listing: [listed('9f8e7d6c', { status: 'busy', state: 'working' })],
				listingAfterStop: [listed('9f8e7d6c', { status: 'busy', state: 'done' })],
			})
			expect(() => stopUnit(ctx, 'ledger-audit')).toThrow(/stop did not take effect/)
			expect(loadAgent(store, 'u1')?.status).toBe('active')
		})

		it('stop reports an unverified stop when the listing cannot be read', () => {
			bgUnit()
			const { ctx } = bgCtx({
				listing: [listed('9f8e7d6c', { status: 'busy', state: 'working' })],
				listingAfterStop: 'unreadable',
			})
			const res = stopUnit(ctx, 'ledger-audit')
			expect(loadAgent(store, 'u1')?.status).toBe('stopped')
			expect(res.verified).toBe(false)
		})
	})

	describe('unit close', () => {
		it('close on a background unit stops and deletes the session', async () => {
			bgUnit()
			const { fake, ctx } = bgCtx({ listing: [listed('9f8e7d6c', { status: 'idle', state: 'done' })] })
			await decommission(ctx, { id: 'u1' })
			const claude = fake.claude()
			const stop = claude.findIndex((c) => c[0] === 'stop' && c[1] === '9f8e7d6c')
			const rm = claude.findIndex((c) => c[0] === 'rm' && c[1] === '9f8e7d6c')
			expect(stop).toBeGreaterThanOrEqual(0)
			expect(rm).toBeGreaterThan(stop)
			expect(loadAgent(store, 'u1')).toBeUndefined()
		})

		it('close on a leased background unit releases the lease and deletes the session', async () => {
			const root = join(tmp, 'leased-worktree')
			mkdirSync(root)
			const lease = { leaseId: 'lease-7', holder: 'cyberlegion:u1' }
			bgUnit({ cwd: root, worktree: { root, branch: 'cyberlegion/unit-u1', primaryRoot, lease } })
			const fake = fakeClaude({ other: git(), listing: [listed('9f8e7d6c', { status: 'idle', state: 'done' })] })
			await decommission({ store, env: {}, exec: fake.exec }, { id: 'u1' })
			expect(leases.released).toEqual([expect.objectContaining({ worktree: root, ...lease })])
			expect(existsSync(root)).toBe(true)
			const claude = fake.claude()
			const stop = claude.findIndex((c) => c[0] === 'stop' && c[1] === '9f8e7d6c')
			const rm = claude.findIndex((c) => c[0] === 'rm' && c[1] === '9f8e7d6c')
			expect(stop).toBeGreaterThanOrEqual(0)
			expect(rm).toBeGreaterThan(stop)
			expect(loadAgent(store, 'u1')).toBeUndefined()
		})

		// "spawned with --worktree-path": the record carries a worktree with no lease, so close removes it.
		it('a refused close leaves the background session untouched', async () => {
			const root = join(tmp, 'unit-worktree')
			mkdirSync(root)
			bgUnit({ cwd: root, worktree: { root, branch: 'cyberlegion/unit-u1', primaryRoot } })
			const fake = fakeClaude({ other: git({ dirty: true }) })
			await expect(decommission({ store, env: {}, exec: fake.exec }, { id: 'u1' })).rejects.toThrow(
				/uncommitted changes/,
			)
			expect(fake.claude().some(([sub]) => sub === 'stop' || sub === 'rm')).toBe(false)
			expect(loadAgent(store, 'u1')).toBeDefined()
		})

		it('a close whose worktree removal fails leaves the background session untouched', async () => {
			const root = join(tmp, 'unit-worktree')
			mkdirSync(root)
			bgUnit({ cwd: root, worktree: { root, branch: 'cyberlegion/unit-u1', primaryRoot } })
			const fake = fakeClaude({ other: git({ removeFails: 'fatal: cannot remove worktree: device busy' }) })
			await expect(decommission({ store, env: {}, exec: fake.exec }, { id: 'u1', force: true })).rejects.toThrow(
				/worktree removal failed/,
			)
			expect(fake.claude().some(([sub]) => sub === 'stop' || sub === 'rm')).toBe(false)
			expect(loadAgent(store, 'u1')).toBeDefined()
		})

		it('close on a background unit whose session is gone still reaps the record', async () => {
			bgUnit()
			const { ctx } = bgCtx({ stop: { stderr: 'no session 9f8e7d6c' }, rm: { stderr: 'no session 9f8e7d6c' } })
			const res = await decommission(ctx, { id: 'u1' })
			expect(loadAgent(store, 'u1')).toBeUndefined()
			expect(res.agent.id).toBe('u1')
		})
	})

	describe('unit focus, clear, restart, rebind', () => {
		it('focus on a background unit is refused naming claude attach', () => {
			bgUnit()
			const { fake, ctx } = bgCtx({ listing: [listed('9f8e7d6c', { status: 'idle', state: 'done' })] })
			expect(() => focusUnit(ctx, 'ledger-audit')).toThrow(/claude attach 9f8e7d6c/)
			expect(fake.claude()).toEqual([])
			expect(fake.muxCalls()).toEqual([])
		})

		it('clear on a background unit is refused and runs nothing', async () => {
			bgUnit()
			const { fake, ctx } = bgCtx({ listing: [listed('9f8e7d6c', { status: 'idle', state: 'done' })] })
			await expect(clearUnit(ctx, 'ledger-audit')).rejects.toThrow(
				/unit clear is unsupported on the background session backend/,
			)
			expect(fake.claude()).toEqual([])
		})

		it('restart on a background unit is refused and runs nothing', async () => {
			bgUnit({ status: 'stopped' })
			const { fake, ctx } = bgCtx({ listing: [listed('9f8e7d6c', { state: 'stopped' })] })
			await expect(restartUnit(ctx, 'ledger-audit')).rejects.toThrow(
				/unit restart is unsupported on the background session backend/,
			)
			expect(fake.claude()).toEqual([])
			expect(loadAgent(store, 'u1')?.status).toBe('stopped')
		})

		it('rebind onto a background unit is refused and keeps its locator', () => {
			bgUnit({ status: 'stopped', pane: { mux: 'claude-bg', id: '5c4b3a29' } })
			const { ctx } = bgCtx({}, { TMUX: '/tmp/tmux-1/default,1,0', TMUX_PANE: '%4' })
			expect(() => rebindUnit(ctx, 'ledger-audit')).toThrow(
				/unit rebind is unsupported on the background session backend/,
			)
			const rec = loadAgent(store, 'u1')
			expect(rec?.pane).toEqual({ mux: 'claude-bg', id: '5c4b3a29' })
			expect(rec?.status).toBe('stopped')
		})
	})
})

// The deterministic inner layer under `unit read`: which escape families the log's text is stripped of.
describe('stripControl', () => {
	it.each([
		['CSI color', '\x1b[31mred\x1b[0m', 'red'],
		['CSI private mode', 'a\x1b[?25lb\x1b[?25h', 'ab'],
		['CSI cursor move', 'x\x1b[12;40Hy', 'xy'],
		['OSC title, BEL-terminated', '\x1b]0;tab title\x07text', 'text'],
		['OSC hyperlink, ST-terminated', '\x1b]8;;https://e.x\x1b\\link\x1b]8;;\x1b\\', 'link'],
		['charset select', '\x1b(Bplain', 'plain'],
		['two-byte escape', 'a\x1bMb', 'ab'],
		['carriage return and bell', 'one\r\ntwo\x07', 'one\ntwo'],
		['tab and newline kept', 'a\tb\nc', 'a\tb\nc'],
	])('removes %s', (_name, input, expected) => {
		expect(stripControl(input)).toBe(expected)
	})
})
