import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { tmuxMuxAdapter } from 'cyber-mux'
import { beforeEach, describe, expect, it } from 'vitest'
import { wakeRecipient } from './console/doorbell.ts'
import {
	type AgentRecord,
	type Exec,
	type IdContext,
	listAgents,
	loadAgent,
	register,
	registerStanding,
	saveAgent,
	standingId,
} from './identity.ts'
import { presenceBrief, spawnPresence } from './presence-spawn.ts'
import { FileStore } from './store/file-store.ts'
import { acquireLock } from './store/lock.ts'

// spec: mail/doorbell/doorbell.feature — "A standing owner with a home and no live presence gets one
// spawned there". Driven through `wakeRecipient` with the real `spawnPresence` injected, over a fake
// tmux whose panes behave like a harness: a typed line plus Enter is posted to the transcript.

const tmuxVerb = (args: readonly string[]) => (args[0] === '-u' ? args[1] : args[0])
const QUICK = { nudgeOpts: { attempts: 2, settleMs: 0, sleep: async () => {} }, trustOpts: { sleep: async () => {} } }
const CLAUDE_TRUST = (focus: 'no' | 'yes') =>
	` Quick safety check: Is this a project you created or one you trust?\n ${focus === 'no' ? '❯' : ' '} No, exit\n ${focus === 'yes' ? '❯' : ' '} Yes, I trust this folder\n Enter to confirm · Esc to cancel`

const REPLY = ['working on it', 'reply line 1', 'reply line 2', 'reply line 3', 'reply line 4', 'reply line 5']

interface Pane {
	posted: string[]
	box: string
	trust?: 'no' | 'yes' | 'stuck'
	/** A harness that never posts what is typed into it. */
	deaf?: boolean
	pressed: string[]
	reads: number
}

let store: FileStore
let root: string
let panes: Map<string, Pane>
let opened: string[][]
let nextPane: number

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), 'cl-presence-'))
	store = new FileStore(join(root, 'hub'))
	panes = new Map()
	opened = []
	nextPane = 10
})

/** How a newly opened pane's harness behaves. */
let paneShape: Partial<Pane> = {}

function screenOf(p: Pane): string {
	if (p.reads === 1) return '$ codex'
	if (p.trust === 'stuck') return CLAUDE_TRUST('no')
	if (p.trust) return CLAUDE_TRUST(p.trust)
	return [...p.posted, `> ${p.box}`].join('\n')
}

const fakeTmux: Exec = (cmd, args) => {
	if (cmd !== 'tmux') return null
	const verb = tmuxVerb(args)
	const target = args[args.indexOf('-t') + 1] ?? ''
	if (verb === 'new-window' || verb === 'split-window') {
		opened.push(args)
		const id = `%${nextPane++}`
		panes.set(id, { posted: [], box: '', pressed: [], reads: 0, ...paneShape })
		return `${id}\t@1`
	}
	const p = panes.get(target)
	if (verb === 'list-panes' || verb === 'has-session' || verb === 'display-message') return p ? target : null
	if (verb === 'capture-pane') {
		if (!p) return null
		p.reads++
		return screenOf(p)
	}
	// keys before the harness's first frame are the launch command, typed into the shell
	if (verb === 'send-keys' && p && p.reads > 0) {
		const literal = args.includes('-l')
		const keys = args.slice(args.indexOf('-t') + 2).filter((a) => a !== '-l')
		for (const k of keys) {
			if (literal) p.box += k
			else if (p.trust === 'no' || p.trust === 'yes') {
				if (k === 'Down') p.trust = 'yes'
				if (k === 'Enter') p.trust = p.trust === 'yes' ? undefined : 'no'
			} else if (k === 'Enter' && p.trust !== 'stuck') {
				// a posted turn is followed by the harness's own reply, so it is not left at the bottom
				if (p.box && !p.deaf) p.posted.push(p.box, ...REPLY)
				if (!p.deaf) p.box = ''
			}
		}
	}
	return null
}

/** A sender inside a tmux pane. */
function senderCtx(env: NodeJS.ProcessEnv = { TMUX: 't', TMUX_PANE: '%1' }, exec: Exec = fakeTmux): IdContext {
	return { store, env, exec, now: () => 1_700_000_000_000 }
}

function folder(name: string): string {
	const dir = join(root, name)
	mkdirSync(dir, { recursive: true })
	return dir
}

function keeperWithHome(home: { harness: 'codex' | 'claude' } | { agent: string }, dir = folder('keeper-desk')) {
	return registerStanding(senderCtx(), { handle: 'keeper', home: { dir, ...home } as AgentRecord['home'] & {} })
}

async function send(ctx: IdContext = senderCtx(), opts: { noNudge?: boolean } = {}) {
	return wakeRecipient(
		ctx.store,
		() => tmuxMuxAdapter,
		ctx.exec as Exec,
		{
			toId: standingId('keeper'),
			fromId: 'sender',
			noNudge: opts.noNudge,
			spawnHome: (owner) => spawnPresence(ctx, owner, QUICK),
		},
		QUICK.nudgeOpts,
		{ sleep: async () => {} },
	)
}

const keeper = () => loadAgent(store, standingId('keeper'))
const spawnedUnits = () => listAgents(store).filter((a) => a.kind !== 'standing' && a.id !== 'bound-main')

/** A live unit in its own pane, bound as keeper's presence. */
function livePresence(): AgentRecord {
	const pane = `%${nextPane++}`
	panes.set(pane, { posted: [], box: '', pressed: [], reads: 5 })
	const unit = register(
		{ store, env: { TMUX: 't', TMUX_PANE: pane }, exec: () => 'x' },
		{ handle: 'standin', harness: 'codex' },
	)
	const rec = keeper() as AgentRecord
	rec.presence = unit.id
	saveAgent(store, rec)
	return unit
}

/** A focused human pane bound as the hub's main pane. */
function focusedMainPane(): string {
	const pane = `%${nextPane++}`
	panes.set(pane, { posted: [], box: '', pressed: [], reads: 5 })
	store.setMainPane(pane)
	return pane
}

describe('spec:cyberlegion/mail/doorbell — a standing owner with a home gets a presence spawned there', () => {
	beforeEach(() => {
		paneShape = {}
	})

	it('sending to a standing owner with a home and no presence spawns a unit there and binds it as the presence', async () => {
		keeperWithHome({ harness: 'codex' })
		const main = focusedMainPane()
		const res = await send()
		const [unit] = spawnedUnits()
		expect(spawnedUnits()).toHaveLength(1)
		expect(unit?.harness).toBe('codex')
		expect(unit?.cwd).toBe(join(root, 'keeper-desk'))
		expect(unit?.worktree).toBeNull()
		// its own workspace: on tmux a labelled window (a tab opens unlabelled), not a split of the
		// sender's pane
		expect(tmuxVerb(opened[0] as string[])).toBe('new-window')
		expect(opened[0]).toContain('-n')
		expect(keeper()?.presence).toBe(unit?.id)
		expect(res.spawned).toBe(unit?.id)
		expect(panes.get(main)?.posted).toEqual([])
	})

	it('a standing owner whose presence has exited gets a new presence spawned in its home', async () => {
		keeperWithHome({ harness: 'codex' })
		const old = livePresence()
		saveAgent(store, { ...old, status: 'exited' })
		await send()
		const fresh = spawnedUnits().filter((u) => u.id !== old.id)
		expect(fresh).toHaveLength(1)
		expect(fresh[0]?.cwd).toBe(join(root, 'keeper-desk'))
		expect(keeper()?.presence).toBe(fresh[0]?.id)
		expect(panes.get(old.pane?.id as string)?.posted).toEqual([])
	})

	it("the unit spawned in the home is told to read the owner's mail", async () => {
		keeperWithHome({ harness: 'codex' })
		const res = await send()
		const unit = loadAgent(store, res.spawned as string) as AgentRecord
		expect(store.readBrief(unit.id)).toContain('mail inbox --owner keeper')
		expect(res.rung).toBe(true)
		expect(panes.get(res.pane as string)?.posted.join('\n')).toContain(unit.brief as string)
	})

	it("the home's folder-trust prompt is accepted", async () => {
		keeperWithHome({ harness: 'claude' })
		paneShape = { trust: 'no' }
		const res = await send()
		const pane = panes.get(res.pane as string) as Pane
		expect(pane.trust).toBeUndefined()
		expect(res.rung).toBe(true)
		expect(pane.posted.join('\n')).toContain(loadAgent(store, res.spawned as string)?.brief as string)
	})

	it('a spawned unit stuck at its trust prompt is unbound and the send warns', async () => {
		const desk = folder('keeper-desk')
		keeperWithHome({ harness: 'claude' }, desk)
		const main = focusedMainPane()
		paneShape = { trust: 'stuck' }
		const res = await send()
		expect(panes.get(main)?.posted).toEqual([])
		expect(res.warning).toContain(desk)
		expect(res.warning).toContain(res.pane as string)
		expect(keeper()?.presence).toBeUndefined()
		expect(panes.get(res.pane as string)?.box).toBe('')
		expect(panes.get(res.pane as string)?.posted).toEqual([])
	})

	it('a spawned presence whose first turn never posts stays bound and the send still succeeds', async () => {
		keeperWithHome({ harness: 'codex' })
		paneShape = { deaf: true }
		const res = await send()
		expect(res.rung).toBe(false)
		expect(res.warning).toBeTruthy()
		expect(keeper()?.presence).toBe(res.spawned)
	})

	it('a standing owner with a home and a live presence is rung there and nothing is spawned', async () => {
		keeperWithHome({ harness: 'codex' })
		const unit = livePresence()
		const res = await send()
		expect(res.rung).toBe(true)
		expect(res.pane).toBe(unit.pane?.id)
		expect(opened).toHaveLength(0)
		expect(spawnedUnits()).toHaveLength(1)
	})

	it('two near-simultaneous deliveries spawn one presence, not two', async () => {
		keeperWithHome({ harness: 'codex' })
		// The second delivery read keeper before the first bound its presence, so it reaches the spawn
		// step too: the re-read under the presence lock is what finds the first one's unit.
		const staleRead = keeper() as AgentRecord
		const first = await send()
		const second = await spawnPresence(senderCtx(), staleRead, QUICK)
		expect(second.kind).toBe('existing')
		expect(spawnedUnits()).toHaveLength(1)
		expect(keeper()?.presence).toBe(first.spawned)
	})

	it('the presence lock is held across the trust step and released before the first-turn ring', async () => {
		keeperWithHome({ harness: 'codex' })
		const lockDir = join(store.root, 'locks', `presence:${standingId('keeper')}.lock`)
		const heldDuringTrust: boolean[] = []
		const heldDuringRing: boolean[] = []
		const ctx = senderCtx()
		await wakeRecipient(store, () => tmuxMuxAdapter, fakeTmux, {
			toId: standingId('keeper'),
			fromId: 'sender',
			spawnHome: (owner) =>
				spawnPresence(ctx, owner, {
					trustOpts: { sleep: async () => void heldDuringTrust.push(existsSync(lockDir)) },
					nudgeOpts: { attempts: 2, settleMs: 0, sleep: async () => void heldDuringRing.push(existsSync(lockDir)) },
				}),
		})
		expect(heldDuringTrust.length).toBeGreaterThan(0)
		expect(heldDuringTrust.every(Boolean)).toBe(true)
		expect(heldDuringRing.length).toBeGreaterThan(0)
		expect(heldDuringRing.some(Boolean)).toBe(false)
	})

	it('an unexpected error in the trust step leaves no presence bound', async () => {
		keeperWithHome({ harness: 'codex' })
		const ctx = senderCtx()
		const res = await wakeRecipient(store, () => tmuxMuxAdapter, fakeTmux, {
			toId: standingId('keeper'),
			fromId: 'sender',
			spawnHome: (owner) =>
				spawnPresence(ctx, owner, {
					trustOpts: {
						sleep: async () => {
							throw new Error('screen read blew up')
						},
					},
				}),
		})
		expect(res.warning).toContain('no presence could be spawned')
		expect(keeper()?.presence).toBeUndefined()
	})

	it('a presence lock held past its timeout warns and falls back to the bound main pane', async () => {
		keeperWithHome({ harness: 'codex' })
		const main = focusedMainPane()
		const held = acquireLock(store.root, `presence:${standingId('keeper')}`)
		try {
			const res = await send()
			expect(res.warning).toContain('keeper')
			expect(res.warning).toContain('no presence could be spawned')
			expect(spawnedUnits()).toHaveLength(0)
			expect(res.rung).toBe(true)
			expect(res.pane).toBe(main)
		} finally {
			held.release()
		}
	}, 15_000)

	it('a sender outside any multiplexer spawns nothing and warns instead of staying silent', async () => {
		keeperWithHome({ harness: 'codex' })
		const ctx = senderCtx({ CYBER_MUX: 'none' }, () => null)
		const res = await wakeRecipient(
			store,
			() => {
				throw new Error('spawn requires a session backend — run inside tmux ($TMUX) or herdr ($HERDR_ENV=1)')
			},
			() => null,
			{
				toId: standingId('keeper'),
				fromId: 'sender',
				spawnHome: (owner) => spawnPresence(ctx, owner, QUICK),
			},
		)
		expect(spawnedUnits()).toHaveLength(0)
		expect(res.rung).toBe(false)
		expect(res.warning).toContain('keeper')
		expect(res.warning).toContain('no presence could be spawned')
		expect(res.warning).toContain('CYBER_MUX')
	})

	it('a sender outside any pane that names a running multiplexer spawns the presence', async () => {
		keeperWithHome({ harness: 'codex' })
		// no $TMUX / $TMUX_PANE: the sender is in no pane, but names tmux
		const res = await send(senderCtx({ CYBER_MUX: 'tmux' }))
		expect(spawnedUnits()).toHaveLength(1)
		expect(spawnedUnits()[0]?.cwd).toBe(join(root, 'keeper-desk'))
		expect(keeper()?.presence).toBe(res.spawned)
	})

	it('a home whose agent definition no longer resolves warns and spawns nothing', async () => {
		const desk = folder('keeper-desk')
		mkdirSync(join(desk, '.agents', 'agents'), { recursive: true })
		writeFileSync(join(desk, '.agents', 'agents', 'triage.md'), '---\nharness: codex\n---\nsort mail\n')
		keeperWithHome({ agent: 'triage' }, desk)
		rmSync(join(desk, '.agents', 'agents', 'triage.md'))
		const res = await send()
		expect(spawnedUnits()).toHaveLength(0)
		expect(res.warning).toContain('keeper')
		expect(res.warning).toContain('no presence could be spawned')
	})

	it('a home that cannot be spawned warns and falls back to the bound main pane', async () => {
		const desk = folder('keeper-desk')
		keeperWithHome({ harness: 'codex' }, desk)
		rmSync(desk, { recursive: true })
		const main = focusedMainPane()
		const res = await send()
		expect(spawnedUnits()).toHaveLength(0)
		expect(res.warning).toContain('keeper')
		expect(res.warning).toContain('no presence could be spawned')
		expect(res.rung).toBe(true)
		expect(res.pane).toBe(main)
	})

	it("--no-nudge spawns nothing into a standing owner's home", async () => {
		keeperWithHome({ harness: 'codex' })
		const res = await send(senderCtx(), { noNudge: true })
		expect(res.rung).toBe(false)
		expect(spawnedUnits()).toHaveLength(0)
		expect(keeper()?.presence).toBeUndefined()
	})

	it('presenceBrief names whom the presence stands in for', () => {
		expect(presenceBrief('keeper')).toContain('"keeper"')
	})
})
