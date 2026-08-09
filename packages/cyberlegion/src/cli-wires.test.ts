import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FileStore } from './store/file-store.ts'

// The CLI option wires, driven through the real Commander program in-process. Round 12 moved the
// spawn translation into a pure seam, and round 13 showed the wire had simply moved one hop: the
// `.action()` body still assembled the argument objects, and nothing reached it. `runCli` is now
// exported, so the bodies execute here and a dropped or inverted flag fails.
const spawnAndWake = vi.fn()
const nudgeUnit = vi.fn()
const decommission = vi.fn()

vi.mock('./session.ts', async () => ({
	...(await vi.importActual<typeof import('./session.ts')>('./session.ts')),
	spawnAndWake: (...a: unknown[]) => spawnAndWake(...a),
	nudgeUnit: (...a: unknown[]) => nudgeUnit(...a),
}))
vi.mock('./decommission.ts', async () => ({
	...(await vi.importActual<typeof import('./decommission.ts')>('./decommission.ts')),
	decommission: (...a: unknown[]) => decommission(...a),
}))

let space: string
beforeEach(() => {
	vi.clearAllMocks()
	space = join(mkdtempSync(join(tmpdir(), 'cl-wires-')), 'hub')
	spawnAndWake.mockResolvedValue({ agent: { id: 'p1', handle: 'p1' }, pane: '%9', launch: 'claude', rung: true })
	decommission.mockReturnValue({ id: 'p1', worktreeRemoved: false, paneTornDown: false })
	nudgeUnit.mockResolvedValue({ agent: { id: 'p1' }, pane: '%9', message: 'x', resubmits: 0 })
})

/** `unit close` resolves its ref through the real registry before decommission runs. */
function registerPeer() {
	const store = new FileStore(space)
	store.putAgent({
		id: 'p1',
		handle: 'p1',
		harness: 'claude',
		cwd: '/tmp',
		pane: { mux: 'tmux', id: '%9' },
		status: 'active',
		createdAt: 'x',
		lastSeen: 'x',
	})
}

async function cli(args: string[]) {
	const { runCli } = await import('./cli.ts')
	await runCli(['node', 'cyberlegion', ...args, '--space', space])
}

describe('spec:cyberlegion/unit/lifecycle CLI option wires', () => {
	it('--no-wake reaches spawn, and its absence rings', async () => {
		await cli(['unit', 'spawn', '--harness', 'claude', '--task', 't', '--no-wake'])
		expect(spawnAndWake.mock.calls[0]?.[2]).toMatchObject({ noWake: true })
		vi.clearAllMocks()
		spawnAndWake.mockResolvedValue({ agent: { id: 'p1', handle: 'p1' }, pane: '%9', launch: 'claude', rung: true })
		await cli(['unit', 'spawn', '--harness', 'claude', '--task', 't'])
		expect(spawnAndWake.mock.calls[0]?.[2]).toMatchObject({ noWake: false })
	})

	it('--message reaches nudge, and its absence leaves the default to the domain', async () => {
		await cli(['unit', 'nudge', 'p1', '--message', 'ship the release'])
		expect(nudgeUnit.mock.calls[0]?.[2]).toMatchObject({ message: 'ship the release' })
	})

	it('--force reaches close, and its absence does not', async () => {
		registerPeer()
		await cli(['unit', 'close', 'p1', '--force'])
		expect(decommission.mock.calls[0]?.[1]).toMatchObject({ force: true })
		vi.clearAllMocks()
		decommission.mockReturnValue({ id: 'p1', worktreeRemoved: false, paneTornDown: false })
		registerPeer()
		await cli(['unit', 'close', 'p1'])
		expect(decommission.mock.calls[0]?.[1]).not.toMatchObject({ force: true })
	})
})
