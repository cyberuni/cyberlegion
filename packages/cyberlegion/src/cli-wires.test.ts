import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DELIVERY_DOORBELL } from './console/doorbell.ts'
import { registerProject } from './project.ts'
import { FileStore } from './store/file-store.ts'

// The CLI option wires, driven through the real Commander program in-process. Round 12 moved the
// spawn translation into a pure seam, and round 13 showed the wire had simply moved one hop: the
// `.action()` body still assembled the argument objects, and nothing reached it. `runCli` is now
// exported, so the bodies execute here and a dropped or inverted flag fails.
const spawnAndWake = vi.fn()
const nudgeUnit = vi.fn()
const readUnit = vi.fn()
const decommission = vi.fn()

vi.mock('./session.ts', async () => ({
	...(await vi.importActual<typeof import('./session.ts')>('./session.ts')),
	spawnAndWake: (...a: unknown[]) => spawnAndWake(...a),
	nudgeUnit: (...a: unknown[]) => nudgeUnit(...a),
	readUnit: (...a: unknown[]) => readUnit(...a),
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
	readUnit.mockReturnValue({ agent: { id: 'p1' }, pane: '%9', output: SCRAPE })
})

/** The scrape a mocked `readUnit` hands back — distinctive, so its presence on stdout is a real
 * observation rather than a substring of some incidental status line. */
const SCRAPE = 'vents sealed\nsecond line'

/** Capture what the command PRINTS. `unit read` is the one verb whose whole output is a
 * `console.log`, so a wire test that only inspects the domain call cannot see it stop printing. */
function captureStdout() {
	return vi.spyOn(console, 'log').mockImplementation(() => {})
}

const printed = (log: ReturnType<typeof captureStdout>) => log.mock.calls.map((c) => String(c[0])).join('\n')

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

	it('a spawn that can name no harness never reaches spawn at all', async () => {
		// The frozen refusal promises no worktree, no session and no unit. The translation throws
		// before `spawnAndWake` is called, so the absence of that call IS the absence of all three —
		// a refusal raised inside spawn instead would already have opened the hub's marker and could
		// not honor the Then.
		// the CLI reports the refusal by exiting non-zero, which vitest surfaces as a throw
		await expect(cli(['unit', 'spawn', '--task', 'seal the north greenhouse vents'])).rejects.toThrow(/process\.exit/)
		expect(spawnAndWake).not.toHaveBeenCalled()
	})

	it('--message reaches nudge, and its absence leaves the default to the domain', async () => {
		await cli(['unit', 'nudge', 'p1', '--message', 'ship the release'])
		expect(nudgeUnit.mock.calls[0]?.[2]).toMatchObject({ message: 'ship the release' })
		// ...and the absence half the old title claimed but never drove: with no --message the wire
		// still carries the check-mail doorbell, so a flag that stopped being forwarded cannot hide
		// behind "the domain defaults it anyway".
		vi.clearAllMocks()
		nudgeUnit.mockResolvedValue({ agent: { id: 'p1' }, pane: '%9', message: 'x', resubmits: 0 })
		await cli(['unit', 'nudge', 'p1'])
		expect(nudgeUnit.mock.calls[0]?.[2]).toMatchObject({ message: DELIVERY_DOORBELL })
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

	it('--keep-worktree reaches close, and its absence does not', async () => {
		registerPeer()
		await cli(['unit', 'close', 'p1', '--keep-worktree'])
		expect(decommission.mock.calls[0]?.[1]).toMatchObject({ keepWorktree: true })
		vi.clearAllMocks()
		decommission.mockReturnValue({ id: 'p1', worktreeRemoved: false, paneTornDown: false })
		registerPeer()
		await cli(['unit', 'close', 'p1'])
		expect(decommission.mock.calls[0]?.[1]).not.toMatchObject({ keepWorktree: true })
	})
})

// `unit read`'s whole result is what it PRINTS — the command emits no TOON object, it hands the
// scrape (or its JSON envelope) straight to stdout. Nothing in the package drove that print, so
// dropping the `console.log` entirely left `read` silent with the suite green. The `--lines` and
// `--format` wires are severable from the print and from each other, so each is driven alone.
describe('spec:cyberlegion/unit/lifecycle `unit read` prints the scrape it asked for', () => {
	it('--lines bounds the capture, and the captured output is printed', async () => {
		const log = captureStdout()
		try {
			await cli(['unit', 'read', 'p1', '--lines', '20'])
			// the bound reaches the domain as a NUMBER — Commander hands raw argv strings through, and a
			// '20' string silently becomes a different capture request downstream
			expect(readUnit.mock.calls[0]?.[2]).toEqual({ lines: 20 })
			expect(printed(log)).toContain(SCRAPE)
		} finally {
			log.mockRestore()
		}
	})

	it('with no --lines the capture carries no bound, and the output is still printed', async () => {
		const log = captureStdout()
		try {
			await cli(['unit', 'read', 'p1'])
			// ABSENT, not merely different from 20: a default filled in at the CLI would silently cap
			// every unbounded read.
			expect(readUnit.mock.calls[0]?.[2]).toEqual({ lines: undefined })
			expect(printed(log)).toContain(SCRAPE)
		} finally {
			log.mockRestore()
		}
	})

	it('--format json prints an envelope naming the ref, the pane, and the scrape', async () => {
		const log = captureStdout()
		try {
			await cli(['unit', 'read', 'p1', '--format', 'json'])
			expect(JSON.parse(printed(log))).toEqual({ ref: 'p1', pane: '%9', output: SCRAPE })
		} finally {
			log.mockRestore()
		}
	})

	it('in the default format it prints the raw scrape alone, with no envelope around it', async () => {
		const log = captureStdout()
		try {
			await cli(['unit', 'read', 'p1'])
			// EQUAL, not contains: the json case above is satisfied by an envelope, so "no envelope"
			// is only observable as the scrape being the entire output.
			expect(printed(log)).toBe(SCRAPE)
		} finally {
			log.mockRestore()
		}
	})
})

// The def→spawn join at the CLI. These wires live in the INPUT argument, which the option-wire
// tests above never looked at: they read `spawnAndWake.mock.calls[0][2]` (the options) and nothing
// read `[1]`, so a call site that rebuilt the input — dropping the def's composed command, or
// pinning the harness — changed what the peer launches with the suite green.
describe('spec:cyberlegion/unit/lifecycle an agent def composes the spawn input', () => {
	const INSTRUCTIONS = 'Look for correctness bugs first.'

	/** A throwaway project whose `.agents/agents/reviewer.md` the name search resolves. `--agent`
	 * resolves relative to the process cwd, so the cwd is what points the search here. */
	function agentProject(): string {
		const dir = mkdtempSync(join(tmpdir(), 'cl-agentdef-'))
		mkdirSync(join(dir, '.git'), { recursive: true })
		mkdirSync(join(dir, '.agents', 'agents'), { recursive: true })
		writeFileSync(
			join(dir, '.agents', 'agents', 'reviewer.md'),
			`---\nmodel: sonnet\nharness: claude\n---\n\n${INSTRUCTIONS}\n`,
		)
		return dir
	}

	async function inAgentProject(run: () => Promise<void>): Promise<void> {
		const before = process.cwd()
		process.chdir(agentProject())
		try {
			await run()
		} finally {
			process.chdir(before)
		}
	}

	it("--agent resolves a def whose harness/model/instructions compose the spawn's launch", async () => {
		await inAgentProject(async () => {
			await cli(['unit', 'spawn', '--agent', 'reviewer', '--task', 't'])
			const input = spawnAndWake.mock.calls[0]?.[1] as { harness?: string; command?: string }
			expect(input.harness).toBe('claude') // the def's own harness, with no --harness given
			// ...and the def's model AND instructions actually reach the launch. Asserting only that a
			// command is present lets a bare `claude` through, which silently discards both.
			expect(input.command).toContain(`--model 'sonnet'`)
			expect(input.command).toContain(INSTRUCTIONS)
		})
	})

	it("an explicit --harness overrides the resolved def's own harness", async () => {
		await inAgentProject(async () => {
			await cli(['unit', 'spawn', '--agent', 'reviewer', '--harness', 'codex', '--task', 't'])
			const input = spawnAndWake.mock.calls[0]?.[1] as { harness?: string; command?: string }
			expect(input.harness).toBe('codex')
			// the override reaches the composed launch too — the codex binary, not claude's
			expect(input.command?.startsWith('codex ')).toBe(true)
		})
	})
})

// spec: unit/lifecycle/lifecycle.feature — `--model`/`--effort` override one launch: flag > def >
// harness default, on a def or a bare --harness alike, and the spawn output reports what launched.
describe('spec:cyberlegion/unit/lifecycle', () => {
	/** A throwaway project holding one def, `.agents/agents/gardener.md`, with the given frontmatter. */
	async function withDef(frontmatter: string, instructions: string, run: () => Promise<void>): Promise<void> {
		const dir = mkdtempSync(join(tmpdir(), 'cl-agentdef-'))
		mkdirSync(join(dir, '.git'), { recursive: true })
		mkdirSync(join(dir, '.agents', 'agents'), { recursive: true })
		writeFileSync(join(dir, '.agents', 'agents', 'gardener.md'), `---\n${frontmatter}\n---\n\n${instructions}\n`)
		const before = process.cwd()
		process.chdir(dir)
		try {
			await run()
		} finally {
			process.chdir(before)
		}
	}

	const launched = () => (spawnAndWake.mock.calls[0]?.[1] as { command?: string } | undefined)?.command ?? ''

	it('--model and --effort on a bare --harness spawn launch with those settings', async () => {
		const log = captureStdout()
		await cli(['unit', 'spawn', '--harness', 'claude', '--model', 'sonnet', '--effort', 'high', '--task', 't'])
		expect(launched()).toContain(`--model 'sonnet'`)
		expect(launched()).toContain(`--effort 'high'`)
		expect(printed(log)).toContain('model: sonnet')
		expect(printed(log)).toContain('effort: high')
	})

	it("--model overrides the resolved def's own model and keeps its instructions", async () => {
		await withDef('harness: claude\nmodel: sonnet', 'check the soil pH first', async () => {
			const log = captureStdout()
			await cli(['unit', 'spawn', '--agent', 'gardener', '--model', 'opus', '--task', 't'])
			expect(launched()).toContain(`--model 'opus'`)
			expect(launched()).not.toContain('sonnet')
			expect(launched()).toContain('check the soil pH first')
			expect(printed(log)).toContain('model: opus')
		})
	})

	it("--effort overrides the resolved def's own effort", async () => {
		await withDef('harness: claude\nmodel: sonnet\neffort: low', 'water daily', async () => {
			const log = captureStdout()
			await cli(['unit', 'spawn', '--agent', 'gardener', '--effort', 'max', '--task', 't'])
			expect(launched()).toContain(`--effort 'max'`)
			expect(launched()).not.toContain(`--effort 'low'`)
			expect(printed(log)).toContain('effort: max')
		})
	})

	it("a def's own model and effort are reported when no flag overrides them", async () => {
		await withDef('harness: claude\nmodel: sonnet\neffort: high', 'water daily', async () => {
			const log = captureStdout()
			await cli(['unit', 'spawn', '--agent', 'gardener', '--task', 't'])
			expect(printed(log)).toContain('model: sonnet')
			expect(printed(log)).toContain('effort: high')
		})
	})

	it('a spawn with no model or effort from any source reports the harness default for both', async () => {
		const log = captureStdout()
		await cli(['unit', 'spawn', '--harness', 'codex', '--task', 't'])
		expect(printed(log)).toContain('model: (harness default)')
		expect(printed(log)).toContain('effort: (harness default)')
	})

	it('--effort on a cursor spawn with no model refuses before anything is created', async () => {
		const err = vi.spyOn(console, 'error').mockImplementation(() => {})
		await expect(cli(['unit', 'spawn', '--harness', 'cursor', '--effort', 'high', '--task', 't'])).rejects.toThrow(
			/process\.exit/,
		)
		expect(err.mock.calls.map((c) => String(c[0])).join('\n')).toMatch(/cursor.*model/)
		// the refusal is raised before spawn runs, so no worktree, session or unit exists
		expect(spawnAndWake).not.toHaveBeenCalled()
	})

	it('--effort on a cursor spawn with a model launches with the effort on that model', async () => {
		await cli(['unit', 'spawn', '--harness', 'cursor', '--model', 'gpt-5', '--effort', 'high', '--task', 't'])
		expect(launched()).toContain(`--model 'gpt-5[effort=high]'`)
	})
})

// `service start` composes resolve-or-start around the same spawn wire: it spawns only when this
// caller wins the reservation, binds what it spawned, and hands a failed spawn's reservation back.
describe('spec:cyberlegion/service `service start` spawns at most once and binds the peer', () => {
	function project(): string {
		const dir = mkdtempSync(join(tmpdir(), 'cl-svc-wires-'))
		execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir })
		return registerProject({ store: new FileStore(space) }, { dir }).id
	}

	/** The spawned peer: pane-less, so its liveness is not probed against a real multiplexer. */
	function spawnsPeer() {
		spawnAndWake.mockImplementation(async () => {
			new FileStore(space).putAgent({
				id: 'p1',
				handle: 'p1',
				harness: 'claude',
				cwd: '/tmp',
				pane: null,
				status: 'active',
				createdAt: 'x',
				lastSeen: 'x',
			})
			return { agent: { id: 'p1', handle: 'p1' }, pane: '%9', launch: 'claude', rung: true }
		})
	}

	it('a vacant service spawns one peer with the spawn flags and binds it; a second start spawns nothing', async () => {
		const prj = project()
		spawnsPeer()
		await cli(['service', 'start', prj, 'controller', '--harness', 'claude', '--task', 'own it', '--no-wake'])
		expect(spawnAndWake).toHaveBeenCalledTimes(1)
		expect(spawnAndWake.mock.calls[0]?.[1]).toMatchObject({ harness: 'claude', task: 'own it' })
		expect(spawnAndWake.mock.calls[0]?.[2]).toMatchObject({ noWake: true })
		expect(new FileStore(space).getServiceLease(prj, 'controller')).toMatchObject({ state: 'active', holder: 'p1' })

		await cli(['service', 'start', prj, 'controller', '--harness', 'claude', '--task', 'own it'])
		expect(spawnAndWake).toHaveBeenCalledTimes(1)
	})

	it('a spawn that throws leaves the service vacant for an immediate retry', async () => {
		const prj = project()
		spawnAndWake.mockRejectedValue(new Error('no multiplexer'))
		await expect(cli(['service', 'start', prj, 'controller', '--harness', 'claude', '--task', 't'])).rejects.toThrow(
			/process\.exit/,
		)
		expect(new FileStore(space).getServiceLease(prj, 'controller')?.state).toBe('vacant')
	})
})
