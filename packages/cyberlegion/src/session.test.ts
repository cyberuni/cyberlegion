import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { DELIVERY_DOORBELL } from './console/doorbell.ts'
import { type AgentRecord, type Exec, type Harness, type IdContext, loadAgent, saveAgent } from './identity.ts'
import {
	clearUnit,
	focusUnit,
	labelFor,
	nudgeUnit,
	readUnit,
	resetCommandFor,
	resolveBrief,
	spawn,
	spawnAndWake,
} from './session.ts'
import { FileStore } from './store/file-store.ts'

/**
 * Every path the text names as a LOCATION — a token introduced by a locative cue. Trailing sentence
 * punctuation is stripped; nothing else is.
 *
 * Binding the location is what closes the whole decoration family at once. Bounding the path's edges
 * with a string bar only ever closes the side you thought of: `<path>.bak` (suffix) and
 * `/repo<path>` / `file://<path>` (prefix) are the same defect mirrored, and a bar patched on one
 * side keeps passing the other. A decorated path is simply not the token the cue introduces.
 */
function locatedPaths(text: string): string[] {
	return [...text.matchAll(/\b(?:at|in|from|under)\s+(\S+?)[.,;:!?]?(?=\s|$)/gi)].map((m) => m[1] as string)
}

/**
 * The frozen Then: the doorbell INSTRUCTS the peer to read the brief AT ITS FILE PATH and BEGIN.
 * Order-free — the Then constrains what is said, not the order it is arranged in.
 *
 * The locative requirement is load-bearing, not decoration: keyword conjunction alone
 * (read + brief + begin + path present) is satisfied by the superseded ADR-0027 wake —
 * "Your brief is loaded in context — read it and begin work. <path>" — which tells the peer its
 * context is already populated and leaves the path as unexplained trailing prose. That is the exact
 * failure this contract exists to prevent, so the path must be named AS the brief's location.
 */
function isBriefInstruction(text: string, path: string): boolean {
	return (
		/\bread(?:ing|s)?\b/i.test(text) &&
		/\bbrief\b/i.test(text) &&
		/\bbegin\b/i.test(text) &&
		!/\b(?:do not|don'?t|never|not)\s+begin\b/i.test(text) &&
		// ...and it does not DEFER the beginning. "read your brief at X, then stand by until told to
		// begin" satisfies every keyword above while leaving the peer idle with a brief it has read —
		// the exact failure ADR-0032 removes. This forbids a class of deferral verbs, exactly as the
		// sibling mail doorbell forbids a class of negation verbs; it pins no phrasing.
		!/\b(?:stand\s*by|standby|hold\s+off|hold\s+on|wait|await|pause)\b/i.test(text) &&
		// deferral OF THE BEGINNING specifically — "once you have read your brief, begin work" defers
		// the reading and is conforming, while "begin once I tell you to" defers the work itself. A
		// bare word list rejected both.
		!/\bbegin\b[^.!?]*\b(?:once|when|after|until|unless|before)\b/i.test(text) &&
		locatedPaths(text).includes(path)
	)
}

let store: FileStore
let sent: string[][]
/** Every exec call, in order. `sent` sees only send-keys, so a clause forbidding some OTHER act
 * ("tears nothing down", "focuses nothing") is unfalsifiable against it. */
let allCalls: string[][]
let worktreeAddCalls: string[][]
// The real "primary checkout" — writable, since spawn actually mkdir's the worktree marker under
// it; `git` itself is faked via `fakeExec` below, so no real git repo is required here.
let primaryRoot: string

beforeEach(() => {
	store = new FileStore(join(mkdtempSync(join(tmpdir(), 'cl-')), 'hub'))
	primaryRoot = mkdtempSync(join(tmpdir(), 'cl-primary-'))
	sent = []
	allCalls = []
	worktreeAddCalls = []
})

// tmux `open` asks for `#{pane_id}\t#{window_id}` (tab-separated — `OpenedPane.tab` is required).
const fakeExec: Exec = (cmd, args) => {
	allCalls.push([cmd, ...args])
	if (cmd === 'git') {
		if (args.includes('--git-common-dir')) return `${primaryRoot}/.git`
		if (args.includes('worktree')) {
			worktreeAddCalls.push(args)
			return ''
		}
		return null
	}
	if (args[0] === 'split-window' || args[0] === 'new-window') return '%9\t@1'
	if (args[0] === 'send-keys') sent.push(args)
	return null
}

function ctx(): IdContext {
	return { store, env: { TMUX: 't', CYBERLEGION_AGENT_ID: 'spawner' }, exec: fakeExec, now: () => 1_700_000_000_000 }
}

/** A herdr backend (one that can create a worktree and open its workspace atomically). */
function herdrExecFor(calls: string[][]): Exec {
	return (cmd, args) => {
		if (cmd === 'git') {
			if (args.includes('--git-common-dir')) return `${primaryRoot}/.git`
			if (args.includes('worktree')) return ''
			return null
		}
		calls.push(args)
		if (args[0] === 'worktree' && args[1] === 'create') {
			return JSON.stringify({
				id: 'cli:worktree:create',
				result: {
					root_pane: { pane_id: 'w9:p1', tab_id: 'w9:tT' },
					worktree: { branch: 'b', path: primaryRoot },
					workspace: { workspace_id: 'w9' },
				},
			})
		}
		return null
	}
}

const expectedWorktreePath = (id: string) =>
	resolve(join(dirname(primaryRoot), `${basename(primaryRoot)}.worktrees`, `legion-${id.slice(0, 6)}`))

/**
 * The frozen conjunct every ring-failure scenario carries: "the peer is still registered AND its
 * worktree and session are still created". The registry half alone is not that clause — a post-hoc
 * rollback keyed on the ring's own warning (tear the pane down and drop the worktree, keep the
 * record) satisfies it while destroying exactly what the caller was promised. So the worktree is
 * observed ON DISK by its own stamped marker, the worktree-creating call is observed as issued, and
 * the opened session is observed through the pane pointer that addresses it.
 */
function expectSpawnEffectIntact(res: { agent: AgentRecord; pane: string }, worktreeCalls: string[][]): void {
	const root = res.agent.worktree?.root
	expect(root).toBeTruthy()
	expect(worktreeCalls.some((c) => c.includes('worktree') && c.includes('add'))).toBe(true)
	expect(existsSync(join(root as string, '.agents', 'cyberlegion', 'config.json'))).toBe(true)
	expect(loadAgent(store, res.agent.id)).toBeTruthy()
	expect(store.resolvePaneId(res.pane)).toBe(res.agent.id)
}

describe('spawn opens a pane + pre-registers the peer', () => {
	it('registers the peer (active, pane, spawnedBy) and writes its brief', () => {
		const res = spawn(ctx(), { harness: 'claude', task: 'reply to alice', handle: 'bob', at: 'pane:right' })
		expect(res.pane).toBe('%9')
		const rec = loadAgent(store, res.agent.id)
		// `active` outright — there is no intermediate `spawning` status and nothing later flips it
		// (the SessionStart hook injects no brief and mutates no status).
		expect(rec).toMatchObject({ harness: 'claude', status: 'active', spawnedBy: 'spawner' })
		expect(rec?.pane).toEqual({ mux: 'tmux', id: '%9' })
		expect(store.resolvePaneId('%9')).toBe(res.agent.id)
		expect(store.readBrief(res.agent.id)).toBe('reply to alice')
	})

	// The wire the impl gate caught unbound: the doorbell must name THE PEER'S OWN brief file path,
	// derived from the record spawn just wrote. Testing `wakeSpawn` with a hand-supplied path proves
	// only that it echoes a string — it stays green when the call site passes '' or the brief's body.
	it("the first-turn doorbell names the peer's own brief file path, never the brief body", async () => {
		const TASK = 'reply to alice about the migration'
		// The ring probes the pane's liveness before typing; the shared fakeExec answers neither probe,
		// so it would abort as "pane gone" before sending anything. Answer them here only.
		const wakeExec: Exec = (cmd, args) => {
			if (cmd === 'tmux' && args[0] === 'list-panes') return '%9'
			if (cmd === 'tmux' && args[0] === 'has-session') return ''
			return fakeExec(cmd, args)
		}
		const res = await spawnAndWake(
			{ ...ctx(), exec: wakeExec },
			{ harness: 'claude', task: TASK, handle: 'bob', at: 'pane:right' },
			// One attempt: the ring will not verify a taken turn against a fake pane, and does not need
			// to — the doorbell is typed before verification, and its CONTENT is what this test binds.
			{ nudgeOpts: { attempts: 1, sleep: async () => {} } },
		)
		const typed = sent.flat().join(' ')
		// It is an INSTRUCTION to read AND to begin, not a bare path — asserted on the text that
		// actually reached the pane, since spawnAndWake could otherwise bypass spawnDoorbell. The
		// "then begin" half matters: a doorbell saying "read your brief at X, then wait" satisfies a
		// read-only bar while contradicting the contract.
		expect(isBriefInstruction(typed, res.agent.brief as string)).toBe(true)
		// ...and the path it names must be where the brief ACTUALLY IS. Asserting only that the text
		// contains `res.agent.brief` is a self-set bar — that field is written by the very code under
		// test, and the store keys briefs by agent id, so the two can diverge and the peer gets rung
		// with a path to a file that is not there (the exact failure ADR-0032 exists to prevent).
		expect(res.agent.brief).toBeTruthy()
		expect(typed).toContain(res.agent.brief)
		// Containment alone is too weak: a doorbell naming a DECORATED superstring of the real path
		// ("<brief>.bak", or the path shell-quoted) contains it while pointing at a file that does
		// not exist. Pull the path back out of the doorbell text and read it.
		// It rings THE PEER'S pane. Asserting on the concatenated argv sees what was typed but never
		// where — `clear` binds its own pane this way and the spawn ring did not, so retargeting the
		// ring to any other pane stayed green.
		// located by the path it names, not by word order — "your brief … read it" is as conforming
		// as "read your brief at …", and a locator that assumed one ordering failed as if the TARGET
		// were wrong.
		const ring = sent.find((a) => a.includes('-l') && a.some((x) => x.includes(res.agent.brief as string)))
		expect(ring ? ring[ring.indexOf('-t') + 1] : undefined).toBe(res.pane)
		expect(readFileSync(res.agent.brief as string, 'utf8')).toBe(TASK)
		// ...and the brief's body is never typed into the pane, only its path
		expect(typed).not.toContain(TASK)
		expect(store.readBrief(res.agent.id)).toBe(TASK)
	})

	it('a first-turn ring that never completes is reported as a warning, not a failed spawn', async () => {
		const TASK = 'reply to alice about the migration'
		// a pane that keeps the doorbell staged forever — the ring exhausts its cap
		let staged = ''
		const stuckExec: Exec = (cmd, args) => {
			if (cmd === 'tmux' && args[0] === 'list-panes') return '%9'
			if (cmd === 'tmux' && args[0] === 'has-session') return ''
			// the pane echoes back whatever was typed and never consumes it — a booting harness
			if (cmd === 'tmux' && args[0] === 'capture-pane') return `> ${staged}`
			if (cmd === 'tmux' && args[0] === 'send-keys' && args.includes('-l')) staged = args.at(-1) ?? ''
			return fakeExec(cmd, args)
		}
		const res = await spawnAndWake(
			{ ...ctx(), exec: stuckExec },
			{ harness: 'claude', task: TASK, handle: 'bob', at: 'pane:right' },
			{ nudgeOpts: { attempts: 1, sleep: async () => {} } },
		)
		// the spawn LANDED — worktree, session and record are the guaranteed effect
		expectSpawnEffectIntact(res, worktreeAddCalls)
		expect(store.readBrief(res.agent.id)).toBe(TASK)
		// ...and the un-taken turn is REPORTED rather than swallowed. Without this the whole chain
		// from a failed ring to the operator is unfalsifiable: a peer that never took its first turn
		// looks identical to one that did.
		expect(res.rung).toBe(false)
		expect(res.warning).toBeTruthy()
	})

	it('a ring against a pane the backend reports as gone never fails the spawn', async () => {
		// The shared fakeExec answers no liveness probe, so `nudge` rejects the pane up front as gone —
		// a DIFFERENT failure from the retry-cap exhaustion above, and one that reaches the catch by a
		// different route. Both must degrade to a warning; an implementation that only guarded the cap
		// would throw here and lose a spawn that had already landed.
		const TASK = 'seal the north greenhouse vents'
		const res = await spawnAndWake(
			ctx(),
			{ harness: 'claude', task: TASK, at: 'pane:right' },
			{
				nudgeOpts: { attempts: 1, sleep: async () => {} },
			},
		)
		expectSpawnEffectIntact(res, worktreeAddCalls) // the spawn landed in full
		expect(store.readBrief(res.agent.id)).toBe(TASK)
		expect(res.rung).toBe(false)
		expect(res.warning).toMatch(/no longer exists/) // reported as the gone pane, not swallowed
	})

	it('a ring with no session backend left to resolve never fails the spawn', async () => {
		// The backend goes away BETWEEN the open and the ring, so `selectSessionAdapter` — resolved
		// lazily inside the ring — throws. That throw is outside `nudge` entirely, so a catch wrapped
		// only around the nudge call would let it escape and fail a spawn that already landed.
		let opened = false
		const vanishingExec: Exec = (cmd, args) => {
			// the ancestry probe is the only mux signal (no $TMUX hint), and it stops naming tmux once
			// the pane has been opened
			if (cmd === 'ps') return opened ? '1 bash' : '1 tmux'
			if (cmd === 'git') {
				if (args.includes('--git-common-dir')) return `${primaryRoot}/.git`
				if (args.includes('worktree')) {
					worktreeAddCalls.push(args)
					return ''
				}
				return null
			}
			if (args[0] === 'split-window' || args[0] === 'new-window') {
				opened = true
				return '%9\t@1'
			}
			if (args[0] === 'send-keys') sent.push(args)
			return null
		}
		const TASK = 'seal the north greenhouse vents'
		const res = await spawnAndWake(
			{ store, env: {}, exec: vanishingExec, now: () => 1 },
			{ harness: 'claude', task: TASK, at: 'pane:right' },
			{ nudgeOpts: { attempts: 1, sleep: async () => {} } },
		)
		expectSpawnEffectIntact(res, worktreeAddCalls)
		expect(store.readBrief(res.agent.id)).toBe(TASK)
		expect(res.rung).toBe(false)
		expect(res.warning).toMatch(/session backend/) // the unresolvable backend is what is reported
	})

	it('--no-wake spawns and writes the brief file but delivers no first-turn doorbell', async () => {
		const TASK = 'reply to alice about the migration'
		const wakeExec: Exec = (cmd, args) => {
			if (cmd === 'tmux' && args[0] === 'list-panes') return '%9'
			if (cmd === 'tmux' && args[0] === 'has-session') return ''
			return fakeExec(cmd, args)
		}
		const res = await spawnAndWake(
			{ ...ctx(), exec: wakeExec },
			{ harness: 'claude', task: TASK, handle: 'bob', at: 'pane:right' },
			{ noWake: true, nudgeOpts: { attempts: 1, sleep: async () => {} } },
		)
		// nothing rung — and nothing typed at ANY pane beyond the launch command itself. Asserting
		// only that the brief path is absent leaves a doorbell worded some other way undetected.
		expect(res.rung).toBe(false)
		expect(sent.flat().join(' ')).not.toContain(res.agent.brief)
		expect(sent).toEqual([
			['send-keys', '-t', '%9', '-l', 'CYBER_MUX=tmux CYBER_MUX_PANE=$TMUX_PANE claude'],
			['send-keys', '-t', '%9', 'Enter'],
		])
		// ...but the spawn itself still landed in full: registered peer, pane, brief on disk
		expect(loadAgent(store, res.agent.id)).toBeTruthy()
		expect(res.pane).toBe('%9')
		expect(store.readBrief(res.agent.id)).toBe(TASK)
	})

	it('records no spawnedBy at all when the caller is itself no registered unit', () => {
		// No `$CYBERLEGION_AGENT_ID` and no pane pointer — the caller cannot name itself. The field must
		// be ABSENT, not an empty string and not a fabricated parent: `spawnedBy` is what the owner-mail
		// gate reads (mail/surface), so an empty-string parent would silently demote every unit spawned
		// by an unregistered human into a "spawned unit" that never surfaces owner mail.
		const res = spawn({ store, env: { TMUX: 't' }, exec: fakeExec, now: () => 1 }, { harness: 'claude', task: 't' })
		const rec = loadAgent(store, res.agent.id)
		expect(rec?.status).toBe('active')
		expect(Object.hasOwn(rec as object, 'spawnedBy')).toBe(false)
	})

	it('--handle names the unit on its own record', () => {
		const res = spawn(ctx(), { harness: 'claude', task: 't', handle: 'vinekeeper', at: 'pane:right' })
		expect(loadAgent(store, res.agent.id)?.handle).toBe('vinekeeper')
	})

	it("with no --handle, the handle and the worktree dir share the unit's 6-character short id", () => {
		const res = spawn(ctx(), { harness: 'claude', task: 't', at: 'pane:right' })
		const short = res.agent.id.slice(0, 6)
		expect(loadAgent(store, res.agent.id)?.handle).toBe(short)
		// the SAME slice names the directory, so what the caller is shown lines up with what is on disk
		expect(res.agent.worktree?.root.endsWith(`legion-${short}`)).toBe(true)
	})

	it('takes the brief from a file too', () => {
		const bf = join(store.root, '..', 'brief.txt')
		writeFileSync(bf, 'from file')
		const res = spawn(ctx(), { harness: 'codex', briefFile: bf, at: 'pane:right' })
		expect(store.readBrief(res.agent.id)).toBe('from file')
	})

	it('resolveBrief reads --task - from stdin, and --task text / --brief-file too', () => {
		const bf = join(store.root, '..', 'b2.txt')
		writeFileSync(bf, 'file brief')
		expect(resolveBrief({ task: '-' }, () => 'stdin brief')).toBe('stdin brief')
		expect(resolveBrief({ task: 'inline' })).toBe('inline')
		expect(resolveBrief({ briefFile: bf })).toBe('file brief')
		expect(resolveBrief({})).toBeNull()
	})
})

describe('per-harness launch', () => {
	it("a spawn with no --agent launches the harness's own default binary, unadorned", () => {
		// No def resolved, so no `input.command` is composed in: the reported launch is the bare
		// mapped binary, carrying neither of the two flags a def would add.
		const res = spawn(ctx(), { harness: 'claude', task: 'seal the north greenhouse vents', at: 'pane:right' })
		expect(res.launch).toBe('claude')
		expect(res.launch).not.toContain('--model')
		expect(res.launch).not.toContain('--append-system-prompt')
		// ...and it is the unadorned binary that reaches the pane, not merely what the result reports
		const typed = sent.find((a) => a.includes('-l'))?.at(-1) ?? ''
		expect(typed).toBe('CYBER_MUX=tmux CYBER_MUX_PANE=$TMUX_PANE claude')
	})

	it.each([
		['claude', 'claude'],
		['cursor', 'cursor-agent'],
		['codex', 'codex'],
	])('starts the %s pane with its own CLI', (harness, launch) => {
		const res = spawn(ctx(), { harness, task: 't', at: 'pane:right' })
		expect(res.launch).toBe(launch)
		// The mux fast-path env is prefixed onto the typed launch command, so the spawned peer
		// inherits it and never re-runs its own ancestry discovery. cyber-mux's `submit(text)` composes
		// two tmux calls (no atomic literal-text-plus-Enter primitive): a literal `-l` type, then a
		// bare Enter.
		expect(sent.at(-2)).toEqual(['send-keys', '-t', '%9', '-l', `CYBER_MUX=tmux CYBER_MUX_PANE=$TMUX_PANE ${launch}`])
		expect(sent.at(-1)).toEqual(['send-keys', '-t', '%9', 'Enter'])
	})
})

// The def→launch join's LAST link: resolveSpawnLaunch is bound in agentdef/realize.test.ts, but
// nothing carried its `command` through spawn to the pane, so dropping `input.command ??` — which
// launches a bare `claude` and silently discards the def's model and instructions — stayed green.
describe('a caller-supplied launch command reaches the pane', () => {
	it('types the composed command, not the harness default', () => {
		const composed = `claude --model 'sonnet' --append-system-prompt 'Look for correctness bugs first.'`
		const res = spawn(ctx(), { harness: 'claude', command: composed, task: 't', at: 'pane:right' })
		expect(res.launch).toBe(composed)
		const typed = sent.find((a) => a.includes('-l'))?.at(-1) ?? ''
		expect(typed).toContain(composed) // the def's model and instructions actually reach the pane
		expect(typed).not.toBe('CYBER_MUX=tmux CYBER_MUX_PANE=$TMUX_PANE claude') // not the bare default
	})
})

describe('spawn errors', () => {
	it('errors on an unmapped harness without launching', () => {
		expect(() => spawn(ctx(), { harness: 'grok', task: 't' })).toThrow(/launch map/)
		// ...and it errors BEFORE anything is opened — no worktree created, no session launched, and
		// no half-registered record left behind for `who`/`prune` to trip over
		expect(worktreeAddCalls).toEqual([])
		expect(sent).toEqual([])
		expect(store.listAgents()).toEqual([])
	})
	it('errors when no brief source is supplied, creating and registering nothing', () => {
		expect(() => spawn(ctx(), { harness: 'claude' })).toThrow(/brief/)
		expect(worktreeAddCalls).toEqual([])
		expect(sent).toEqual([])
		expect(store.listAgents()).toEqual([])
	})
	it('errors when neither tmux nor herdr is detected', () => {
		const noBackend: IdContext = { store, env: {}, exec: fakeExec }
		expect(() => spawn(noBackend, { harness: 'claude', task: 't' })).toThrow(/tmux/)
	})
})

describe('spawn creates a real worktree unit, sibling to the primary checkout (not the global hub)', () => {
	it('creates a git worktree distinct from the primary checkout and opens the session there', () => {
		const res = spawn(ctx(), { harness: 'claude', task: 't', at: 'pane:right' })
		const expectedPath = expectedWorktreePath(res.agent.id)
		expect(res.agent.worktree?.root).toBe(expectedPath)
		expect(res.agent.cwd).toBe(expectedPath)
		// git worktree add ran against the primary root, not the unit path
		const addCall = worktreeAddCalls[0]!
		expect(addCall).toEqual(expect.arrayContaining(['-C', primaryRoot, 'worktree', 'add']))
	})

	it("never nests the default worktree inside the primary checkout's own tree", () => {
		const res = spawn(ctx(), { harness: 'claude', task: 't', at: 'pane:right' })
		expect(res.agent.worktree?.root.startsWith(`${resolve(primaryRoot)}/`)).toBe(false)
	})

	it('names the default worktree dir with the same 6-char id slice as the record handle', () => {
		const res = spawn(ctx(), { harness: 'claude', task: 't', handle: 'bob', at: 'pane:right' })
		expect(res.agent.worktree?.root).toBe(expectedWorktreePath(res.agent.id))
		expect(res.agent.worktree?.root.endsWith(`legion-${res.agent.id.slice(0, 6)}`)).toBe(true)
		// an explicit --handle doesn't rename the dir — only id-derived defaults do
		expect(res.agent.worktree?.root.includes('bob')).toBe(false)
	})

	it('opens the tmux pane with -c set to the new worktree root, not the caller cwd', () => {
		const openCalls: string[][] = []
		const exec: Exec = (cmd, args) => {
			if (cmd === 'git') {
				if (args.includes('--git-common-dir')) return `${primaryRoot}/.git`
				if (args.includes('worktree')) return ''
				return null
			}
			if (args[0] === 'split-window') {
				openCalls.push(args)
				return '%9\t@1'
			}
			return null
		}
		const res = spawn(
			{ store, env: { TMUX: 't' }, exec, now: () => 1 },
			{ harness: 'claude', task: 't', at: 'pane:right' },
		)
		const expectedPath = expectedWorktreePath(res.agent.id)
		expect(openCalls[0]).toEqual(['split-window', '-h', '-c', expectedPath, '-P', '-F', '#{pane_id}\t#{window_id}'])
	})

	it('accepts an explicit --branch and --worktree-path', () => {
		const custom = join(store.root, '..', 'custom-unit')
		const res = spawn(ctx(), {
			harness: 'claude',
			task: 't',
			branch: 'my-branch',
			worktreePath: custom,
			at: 'pane:right',
		})
		expect(res.agent.worktree).toEqual({ root: resolve(custom), branch: 'my-branch' })
		const addCall = worktreeAddCalls[0]!
		expect(addCall).toEqual(['-C', primaryRoot, 'worktree', 'add', '-b', 'my-branch', custom])
	})

	it('opens the session in an explicit --worktree-path and records that root', () => {
		// The accepted half of the primary-checkout refusal: a path OUTSIDE the primary is created,
		// the session's cwd follows it, and the record carries it — so the refusal below is a real
		// gate rather than a path that never worked.
		const custom = join(dirname(primaryRoot), `outside-${basename(primaryRoot)}`)
		const openCalls: string[][] = []
		const exec: Exec = (cmd, args) => {
			if (cmd === 'git') {
				if (args.includes('--git-common-dir')) return `${primaryRoot}/.git`
				if (args.includes('worktree')) {
					worktreeAddCalls.push(args)
					return ''
				}
				return null
			}
			if (args[0] === 'split-window') {
				openCalls.push(args)
				return '%9\t@1'
			}
			return null
		}
		const res = spawn(
			{ store, env: { TMUX: 't' }, exec, now: () => 1 },
			{ harness: 'claude', task: 't', worktreePath: custom, at: 'pane:right' },
		)
		expect(worktreeAddCalls[0]).toContain(custom) // created THERE
		expect(openCalls[0]).toContain(resolve(custom)) // ...and the session's own cwd is that path
		expect(loadAgent(store, res.agent.id)?.worktree?.root).toBe(resolve(custom))
	})

	it('defaults the branch to cyberlegion/unit-<id>, and creates the worktree ON it', () => {
		const res = spawn(ctx(), { harness: 'claude', task: 't', at: 'pane:right' })
		expect(res.agent.worktree?.branch).toBe(`cyberlegion/unit-${res.agent.id}`)
		// ...and the default actually reaches `git worktree add -b`. The record's own branch field is
		// written from the same local as the git call, but only on the plain route's success path: a
		// default resolved after the add — or an add that omitted `-b` entirely and let git infer a
		// branch — leaves the record naming a branch the worktree was never created on.
		expect(worktreeAddCalls[0]).toEqual(
			expect.arrayContaining(['worktree', 'add', '-b', `cyberlegion/unit-${res.agent.id}`]),
		)
	})

	it('stamps the new worktree-unit with its own tracked marker so it self-detects', () => {
		const res = spawn(ctx(), { harness: 'claude', task: 't', at: 'pane:right' })
		const marker = join(res.agent.worktree!.root, '.agents', 'cyberlegion', 'config.json')
		expect(existsSync(marker)).toBe(true)
	})
})

describe('refusing the primary checkout', () => {
	it('throws a clear error rather than opening a session in the primary', () => {
		// Driven through the shared fakeExec so the refusal's second clause is checkable: it must
		// throw AND open nothing. A local recording-nothing exec can only see that it threw.
		expect(() =>
			spawn(
				{ store, env: { TMUX: 't' }, exec: fakeExec, now: () => 1 },
				{ harness: 'claude', task: 't', worktreePath: primaryRoot },
			),
		).toThrow(/primary checkout/)
		expect(sent).toHaveLength(0) // and no session is opened
		// ...no worktree was added at that path, and nothing was registered. The refusal's whole point
		// is WHEN it fires: an assert placed after `git worktree add` still throws while leaving a
		// stranded worktree and a record nothing rolls back.
		expect(worktreeAddCalls).toEqual([])
		expect(store.listAgents()).toEqual([])
	})
})

describe('spawn picks its worktree-creation route from the backend AND the placement', () => {
	/** A herdr backend with worktree-creation capability, recording git and herdr calls separately. */
	function herdrRouteExec(gitCalls: string[][], herdrCalls: string[][], worktreeRoot: string): Exec {
		return (cmd, args) => {
			if (cmd === 'git') {
				if (args.includes('--git-common-dir')) return `${primaryRoot}/.git`
				if (args.includes('worktree')) {
					gitCalls.push(args)
					return ''
				}
				return null
			}
			herdrCalls.push(args)
			if (args[0] === 'worktree' && args[1] === 'create') {
				return JSON.stringify({
					result: {
						root_pane: { pane_id: 'w9:p1', tab_id: 'w9:tT' },
						worktree: { branch: args[args.indexOf('--branch') + 1], path: worktreeRoot },
						workspace: { workspace_id: 'w9' },
					},
				})
			}
			if (args[0] === 'tab' && args[1] === 'create') {
				return JSON.stringify({ result: { root_pane: { pane_id: 'w3:pT', tab_id: 'w3:pT' } } })
			}
			return null
		}
	}

	it('a workspace spawn on a backend with NO worktree creation takes the plain route', () => {
		// tmux offers no atomic worktree-and-workspace call, so the same `workspace` placement that
		// takes the atomic route on herdr must fall back to `git worktree add` plus a separate open.
		// Without this case an implementation keyed only on the placement passes every herdr test.
		const openCalls: string[][] = []
		const exec: Exec = (cmd, args) => {
			if (cmd === 'git') {
				if (args.includes('--git-common-dir')) return `${primaryRoot}/.git`
				if (args.includes('worktree')) {
					worktreeAddCalls.push(args)
					return ''
				}
				return null
			}
			if (args[0] === 'new-window') {
				openCalls.push(args)
				return '%42\t@2'
			}
			return null
		}
		const res = spawn(
			{ store, env: { CYBER_MUX: 'tmux' }, exec, now: () => 1 },
			{ harness: 'claude', task: 't', at: 'workspace' },
		)
		expect(worktreeAddCalls[0]).toEqual(expect.arrayContaining(['-C', primaryRoot, 'worktree', 'add']))
		// ...and the session is opened by a SEPARATE call whose cwd is that worktree
		expect(openCalls).toHaveLength(1)
		expect(openCalls[0]).toContain(res.agent.worktree?.root)
	})

	it('a tab placement takes the plain route even on a backend that CAN create worktrees', () => {
		// The guard is compound — atomic route iff the backend offers creation AND the placement is
		// `workspace`. This is the half the herdr-workspace case cannot see.
		const gitCalls: string[][] = []
		const herdrCalls: string[][] = []
		spawn(
			{ store, env: { CYBER_MUX: 'herdr' }, exec: herdrRouteExec(gitCalls, herdrCalls, ''), now: () => 1 },
			{ harness: 'claude', task: 't', at: 'tab' },
		)
		expect(gitCalls.some((c) => c.includes('worktree') && c.includes('add'))).toBe(true)
		expect(herdrCalls[0]!.slice(0, 2)).toEqual(['tab', 'create']) // a separate open
		expect(herdrCalls.some((c) => c[0] === 'worktree' && c[1] === 'create')).toBe(false)
	})

	it('stamps the tracked cyberlegion marker on the worktree the ATOMIC route created too', () => {
		// The plain route's marker is covered above. The atomic route writes the worktree through the
		// backend, so it needs its own stamp — a spawned unit with no marker cannot self-detect the
		// hub until its state is committed.
		const gitCalls: string[][] = []
		const herdrCalls: string[][] = []
		// unique per test run: `dirname(primaryRoot)` is the shared tmp dir, so a fixed name here
		// survives between runs and a marker left by an earlier run makes the assertion unfalsifiable
		const worktreeRoot = join(dirname(primaryRoot), `atomic-marker-${basename(primaryRoot)}`)
		const res = spawn(
			{ store, env: { CYBER_MUX: 'herdr' }, exec: herdrRouteExec(gitCalls, herdrCalls, worktreeRoot), now: () => 1 },
			{ harness: 'claude', task: 't', at: 'workspace' },
		)
		expect(herdrCalls[0]!.slice(0, 2)).toEqual(['worktree', 'create']) // the atomic route ran
		expect(gitCalls).toEqual([]) // ...and no separate git worktree add
		expect(existsSync(join(res.agent.worktree!.root, '.agents', 'cyberlegion', 'config.json'))).toBe(true)
	})
})

describe('the primary-checkout refusal opens nothing, on either worktree path', () => {
	// The frozen Then is "no session is opened". The tmux path adds the worktree, THEN asserts, then
	// opens — so it happens to honor it. The herdr path creates the worktree and opens its workspace
	// in ONE atomic call, so a check placed after that call has already stranded a pane. Only a
	// backend-with-worktree fixture can tell the two apart, and none existed.
	it('refuses before the backend creates a worktree or opens a workspace', () => {
		const calls: string[][] = []
		expect(() =>
			spawn(
				{ store, env: { CYBER_MUX: 'herdr' }, exec: herdrExecFor(calls), now: () => 1 },
				{ harness: 'claude', task: 't', worktreePath: primaryRoot },
			),
		).toThrow(/primary checkout/)
		expect(calls.filter((c) => c[0] === 'worktree' && c[1] === 'create')).toEqual([])
		expect(calls.filter((c) => c[0] === 'tab' || c[0] === 'workspace')).toEqual([])
		expect(store.listAgents()).toEqual([]) // ...and no unit is registered on this route either
	})
})

describe('--cwd spawns into an existing directory, creating no worktree', () => {
	it('opens the session in that directory and registers it with no created worktree', () => {
		const existingDir = mkdtempSync(join(tmpdir(), 'cl-existing-'))
		const res = spawn(ctx(), { harness: 'claude', task: 't', cwd: existingDir, at: 'pane:right' })
		expect(worktreeAddCalls).toHaveLength(0)
		expect(res.agent.cwd).toBe(resolve(existingDir))
		expect(res.agent.worktree).toBeNull()
		const rec = loadAgent(store, res.agent.id)
		expect(rec?.cwd).toBe(resolve(existingDir))
		expect(rec?.worktree).toBeNull()
	})

	it('opens the tmux pane with -c set to the given directory', () => {
		const existingDir = mkdtempSync(join(tmpdir(), 'cl-existing-'))
		const openCalls: string[][] = []
		const exec: Exec = (cmd, args) => {
			if (cmd === 'git') {
				if (args.includes('--git-common-dir')) return `${primaryRoot}/.git`
				return null
			}
			if (args[0] === 'split-window') {
				openCalls.push(args)
				return '%9\t@1'
			}
			return null
		}
		spawn(
			{ store, env: { TMUX: 't' }, exec, now: () => 1 },
			{ harness: 'claude', task: 't', cwd: existingDir, at: 'pane:right' },
		)
		expect(openCalls[0]).toEqual([
			'split-window',
			'-h',
			'-c',
			resolve(existingDir),
			'-P',
			'-F',
			'#{pane_id}\t#{window_id}',
		])
	})

	it('throws when the --cwd directory does not exist, opening nothing', () => {
		const missing = join(primaryRoot, 'does-not-exist')
		expect(() => spawn(ctx(), { harness: 'claude', task: 't', cwd: missing })).toThrow(/must already exist/)
		expect(sent).toHaveLength(0)
		expect(worktreeAddCalls).toHaveLength(0)
		expect(store.listAgents()).toEqual([]) // and no half-registered record survives the refusal
	})

	it('refuses the primary checkout the same as a created worktree', () => {
		expect(() => spawn(ctx(), { harness: 'claude', task: 't', cwd: primaryRoot })).toThrow(/primary checkout/)
		expect(sent).toHaveLength(0)
		expect(worktreeAddCalls).toHaveLength(0)
		expect(store.listAgents()).toEqual([])
	})

	it('is mutually exclusive with --worktree-path', () => {
		const existingDir = mkdtempSync(join(tmpdir(), 'cl-existing-'))
		expect(() =>
			spawn(ctx(), { harness: 'claude', task: 't', cwd: existingDir, worktreePath: join(existingDir, 'wt') }),
		).toThrow(/cannot combine/)
		expect(worktreeAddCalls).toHaveLength(0)
		expect(sent).toHaveLength(0)
		expect(store.listAgents()).toEqual([])
	})

	it('is mutually exclusive with --branch', () => {
		const existingDir = mkdtempSync(join(tmpdir(), 'cl-existing-'))
		expect(() => spawn(ctx(), { harness: 'claude', task: 't', cwd: existingDir, branch: 'some-branch' })).toThrow(
			/cannot combine/,
		)
		expect(worktreeAddCalls).toHaveLength(0)
		expect(sent).toHaveLength(0)
		expect(store.listAgents()).toEqual([])
	})
})

// spec: mux/mux.feature — "a pane placement splits the calling pane, not whichever pane is active".
// A pane:* open must name the caller's own pane explicitly (`from`) — each backend's own default
// tracks whichever pane a HUMAN is looking at, which is only coincidentally the caller's and diverges
// exactly when a program (spawn, always) is driving.
// Bound to the mux node: this block and the herdr backend-selection block below verify mux/ scenarios
// outright. The rest of this file straddles nodes — worktree creation and the reset map are unit/'s —
// so they are deliberately left unbound rather than wrapped, since a binding that names the wrong node
// claims coverage the node does not have.
describe('spec:cyberlegion/mux', () => {
	describe("a pane placement splits the caller's own pane, not whichever pane is active", () => {
		it("tmux: --at pane:right passes the caller's own pane via -t, from $TMUX_PANE", () => {
			const openCalls: string[][] = []
			const exec: Exec = (cmd, args) => {
				if (cmd === 'git') {
					if (args.includes('--git-common-dir')) return `${primaryRoot}/.git`
					if (args.includes('worktree')) return ''
					return null
				}
				if (args[0] === 'split-window') {
					openCalls.push(args)
					return '%9\t@1'
				}
				return null
			}
			// $TMUX_PANE is the caller's own fast-path pane — distinct from whatever tmux's own "active
			// pane" default would resolve to, which this test never even fakes.
			spawn(
				{ store, env: { TMUX: 't', TMUX_PANE: '%caller' }, exec, now: () => 1 },
				{ harness: 'claude', task: 't', at: 'pane:right' },
			)
			expect(openCalls[0]).toEqual(
				expect.arrayContaining(['split-window', '-h', '-t', '%caller', '-P', '-F', '#{pane_id}\t#{window_id}']),
			)
		})

		it("herdr: --at pane:down passes the caller's own pane explicitly, never --current", () => {
			const herdrCalls: string[][] = []
			const exec: Exec = (cmd, args) => {
				if (cmd === 'git') {
					if (args.includes('--git-common-dir')) return `${primaryRoot}/.git`
					if (args.includes('worktree')) return ''
					return null
				}
				if (cmd === 'herdr') {
					herdrCalls.push(args)
					if (args[1] === 'split') {
						return JSON.stringify({
							result: { pane: { pane_id: 'herdr-pane-1', tab_id: 'w3:tT' }, type: 'pane_info' },
						})
					}
					return null
				}
				return null
			}
			spawn(
				{ store, env: { HERDR_ENV: '1', HERDR_PANE_ID: 'w1:pCaller' }, exec, now: () => 1 },
				{ harness: 'claude', task: 't', at: 'pane:down' },
			)
			expect(herdrCalls[0]).toEqual(['pane', 'split', 'w1:pCaller', '--direction', 'down', '--cwd', expect.any(String)])
			expect(herdrCalls[0]).not.toContain('--current')
		})

		it("tmux: without a known caller pane, falls back to the backend's own default (no -t)", () => {
			const openCalls: string[][] = []
			const exec: Exec = (cmd, args) => {
				if (cmd === 'git') {
					if (args.includes('--git-common-dir')) return `${primaryRoot}/.git`
					if (args.includes('worktree')) return ''
					return null
				}
				if (args[0] === 'split-window') {
					openCalls.push(args)
					return '%9\t@1'
				}
				return null
			}
			// $TMUX set but no $TMUX_PANE — the caller's own pane is unknown, so the conservative fallback
			// is the backend's own default rather than a foreign/guessed pane id.
			spawn({ store, env: { TMUX: 't' }, exec, now: () => 1 }, { harness: 'claude', task: 't', at: 'pane:right' })
			expect(openCalls[0]).not.toContain('-t')
		})
	})

	describe('backend selection: herdr', () => {
		it('spawns via the herdr adapter when $HERDR_ENV is set and no $TMUX', () => {
			const herdrCalls: string[][] = []
			const exec: Exec = (cmd, args) => {
				if (cmd === 'git') {
					if (args.includes('--git-common-dir')) return `${primaryRoot}/.git`
					if (args.includes('worktree')) return ''
					return null
				}
				if (cmd === 'herdr') {
					herdrCalls.push(args)
					if (args[1] === 'split') {
						return JSON.stringify({
							id: 'cli:pane:split',
							result: { pane: { pane_id: 'herdr-pane-1', tab_id: 'w3:tT' }, type: 'pane_info' },
						})
					}
					return null
				}
				return null
			}
			const res = spawn({ store, env: { HERDR_ENV: '1' }, exec }, { harness: 'claude', task: 't', at: 'pane:right' })
			expect(res.pane).toBe('herdr-pane-1')
			expect(herdrCalls[0]).toEqual(['pane', 'split', '--current', '--direction', 'right', '--cwd', res.agent.cwd])
			expect(herdrCalls[1]).toEqual(['pane', 'run', 'herdr-pane-1', 'CYBER_MUX=herdr claude'])
			// The herdr spawn now tags its pane locator with the mux (previously left null) — so the
			// unit's own `prune` runs the herdr liveness check, never a tmux one.
			expect(loadAgent(store, res.agent.id)?.pane).toEqual({ mux: 'herdr', id: 'herdr-pane-1' })
		})

		it("with --at workspace, creates the worktree via herdr's own atomic worktree create, not git worktree add", () => {
			const gitWorktreeCalls: string[][] = []
			const herdrCalls: string[][] = []
			const worktreeRoot = join(dirname(primaryRoot), 'atomic-unit')
			const exec: Exec = (cmd, args) => {
				if (cmd === 'git') {
					if (args.includes('--git-common-dir')) return `${primaryRoot}/.git`
					if (args.includes('worktree')) {
						gitWorktreeCalls.push(args)
						return ''
					}
					return null
				}
				herdrCalls.push(args)
				if (args[0] === 'worktree' && args[1] === 'create') {
					const branch = args[args.indexOf('--branch') + 1]
					return JSON.stringify({
						id: 'cli:worktree:create',
						result: {
							root_pane: { pane_id: 'w9:p1', tab_id: 'w9:tT' },
							worktree: { branch, path: worktreeRoot },
							workspace: { workspace_id: 'w9' },
						},
					})
				}
				return null
			}
			const res = spawn(
				{ store, env: { CYBER_MUX: 'herdr' }, exec, now: () => 1 },
				{ harness: 'claude', task: 't', at: 'workspace' },
			)
			expect(gitWorktreeCalls).toHaveLength(0)
			expect(herdrCalls[0]!.slice(0, 2)).toEqual(['worktree', 'create'])
			expect(res.agent.worktree).toEqual({ root: resolve(worktreeRoot), branch: `cyberlegion/unit-${res.agent.id}` })
			expect(res.agent.cwd).toBe(resolve(worktreeRoot))
			expect(res.pane).toBe('w9:p1')
		})
	})

	// ── spec:cyberlegion/unit/lifecycle — spawn resolves the default placement by mode ──────────────
})

describe('spawn resolves the default --at by spawn mode (own visible space vs current space)', () => {
	// herdr is the discriminating backend — 'workspace' → `worktree create` (own nested workspace),
	// 'tab' → `tab create` (a tab in the caller's current space) are distinct herdr verbs.
	function herdrExec(calls: string[][], worktreeRoot: string): Exec {
		return (cmd, args) => {
			if (cmd === 'git') {
				if (args.includes('--git-common-dir')) return `${primaryRoot}/.git`
				if (args.includes('worktree')) return ''
				return null
			}
			calls.push(args)
			if (args[0] === 'worktree' && args[1] === 'create') {
				const branch = args[args.indexOf('--branch') + 1]
				return JSON.stringify({
					id: 'cli:worktree:create',
					result: {
						root_pane: { pane_id: 'w9:p1', tab_id: 'w9:tT' },
						worktree: { branch, path: worktreeRoot },
						workspace: { workspace_id: 'w9' },
					},
				})
			}
			if (args[0] === 'tab' && args[1] === 'create') {
				return JSON.stringify({
					result: { root_pane: { pane_id: 'w3:pT', tab_id: 'w3:pT' }, type: 'tab_created' },
				})
			}
			if (args[0] === 'workspace' && args[1] === 'create') {
				return JSON.stringify({
					result: { root_pane: { pane_id: 'w5:pW', tab_id: 'w5:pW' }, type: 'workspace_created' },
				})
			}
			if (args[0] === 'pane' && args[1] === 'split') {
				return JSON.stringify({ result: { pane: { pane_id: 'w3:pS', tab_id: 'w3:pT' }, type: 'pane_info' } })
			}
			return null
		}
	}

	// Bound directly, not only through a backend's arguments: cyber-mux names whatever tier `at`
	// opens, so this gate is what keeps a tab spawn from renaming the caller's own tab.
	it('labelFor resolves a label for a workspace placement and nothing at all for any other', () => {
		const input = { harness: 'claude' as const, task: 'audit the governance provenance check' }
		expect(labelFor('workspace', input, input.task, 'abc123def')).toEqual({
			label: '9S-governance-provenance-check',
		})
		for (const at of ['tab', 'pane:right', 'pane:down'] as const) {
			expect(Object.hasOwn(labelFor(at, input, input.task, 'abc123def'), 'label')).toBe(false)
		}
	})

	it('a new-worktree spawn with no --at defaults to its own visible workspace (herdr nested worktree)', () => {
		const calls: string[][] = []
		const worktreeRoot = join(dirname(primaryRoot), 'default-ws-unit')
		const res = spawn(
			{ store, env: { CYBER_MUX: 'herdr' }, exec: herdrExec(calls, worktreeRoot), now: () => 1 },
			{ harness: 'claude', task: 't' },
		)
		// No mux placement passed by the caller, yet it lands in its own nested workspace — deterministic.
		expect(calls[0]!.slice(0, 2)).toEqual(['worktree', 'create'])
		expect(calls.some((c) => c[0] === 'tab' && c[1] === 'create')).toBe(false)
		expect(res.agent.cwd).toBe(resolve(worktreeRoot))
	})

	it('the new-worktree workspace default does not depend on whichever workspace is focused', () => {
		// Same spawn, but the caller now sits in a live pane of its own — the deterministic clause
		// says the placement must not vary with that. Without a fixture that VARIES the caller's
		// pane, nothing forbids the default keying off it.
		const calls: string[][] = []
		const worktreeRoot = join(dirname(primaryRoot), 'focused-ws-unit')
		spawn(
			{
				store,
				env: { CYBER_MUX: 'herdr', HERDR_ENV: '1', HERDR_PANE_ID: 'w9:p9' },
				exec: herdrExec(calls, worktreeRoot),
				now: () => 1,
			},
			{ harness: 'claude', task: 't' },
		)
		expect(calls[0]!.slice(0, 2)).toEqual(['worktree', 'create'])
		expect(calls.some((c) => c[0] === 'tab' && c[1] === 'create')).toBe(false)
	})

	it('a new-worktree spawn with no --at lands a VISIBLE tmux window, never a detached session', () => {
		const calls: string[][] = []
		const exec: Exec = (cmd, args) => {
			if (cmd === 'git') {
				if (args.includes('--git-common-dir')) return `${primaryRoot}/.git`
				if (args.includes('worktree')) return ''
				return null
			}
			calls.push(args)
			if (args[0] === 'new-window') return '%42\t@2'
			return null
		}
		const res = spawn({ store, env: { CYBER_MUX: 'tmux' }, exec, now: () => 1 }, { harness: 'claude', task: 't' })
		// `-d` (background, visible) is asserted by presence, not position: a workspace spawn also
		// carries a label now, and where the backend orders `-n <label>` against `-d` is its own affair.
		expect(calls[0]![0]).toBe('new-window')
		expect(calls[0]).toContain('-d')
		expect(calls.some((c) => c[0] === 'new-session')).toBe(false)
		expect(res.pane).toBe('%42')
	})

	it("a --cwd spawn with no --at defaults to a tab in the caller's current space, not its own workspace", () => {
		const calls: string[][] = []
		const existingDir = mkdtempSync(join(tmpdir(), 'cl-cwd-'))
		spawn(
			{ store, env: { CYBER_MUX: 'herdr' }, exec: herdrExec(calls, ''), now: () => 1 },
			{ harness: 'claude', task: 't', cwd: existingDir },
		)
		expect(calls[0]!.slice(0, 2)).toEqual(['tab', 'create'])
		expect(calls.some((c) => c[0] === 'worktree' && c[1] === 'create')).toBe(false)
	})

	it('an explicit --at overrides the new-worktree default (new-worktree spawn honoring --at tab)', () => {
		const calls: string[][] = []
		const worktreeRoot = join(dirname(primaryRoot), 'override-unit')
		spawn(
			{ store, env: { CYBER_MUX: 'herdr' }, exec: herdrExec(calls, worktreeRoot), now: () => 1 },
			{ harness: 'claude', task: 't', at: 'tab' },
		)
		// Explicit tab wins even though the new-worktree default would have been workspace.
		expect(calls[0]!.slice(0, 2)).toEqual(['tab', 'create'])
		expect(calls.some((c) => c[0] === 'worktree' && c[1] === 'create')).toBe(false)
	})

	it('an explicit --at overrides the --cwd default (--cwd spawn honoring --at workspace)', () => {
		const calls: string[][] = []
		const existingDir = mkdtempSync(join(tmpdir(), 'cl-cwd-'))
		spawn(
			{ store, env: { CYBER_MUX: 'herdr' }, exec: herdrExec(calls, ''), now: () => 1 },
			{ harness: 'claude', task: 't', cwd: existingDir, at: 'workspace' },
		)
		// Explicit workspace wins even though the --cwd default would have been tab.
		expect(calls[0]!.slice(0, 2)).toEqual(['workspace', 'create'])
		expect(calls.some((c) => c[0] === 'tab' && c[1] === 'create')).toBe(false)
	})
})

// ── spec:cyberlegion/unit/lifecycle — clear resets a warm peer's context ────────────────────────

/** Registers a unit record directly (no spawn) so `clear` scenarios start from a known-live peer. */
function registerUnit(rec: Partial<AgentRecord> & { id: string }): AgentRecord {
	const full: AgentRecord = {
		handle: rec.id.slice(0, 6),
		harness: 'claude',
		cwd: '/somewhere',
		worktree: { root: '/somewhere', branch: `cyberlegion/unit-${rec.id}` },
		status: 'active',
		createdAt: '2026-01-01T00:00:00.000Z',
		lastSeen: '2026-01-01T00:00:00.000Z',
		pane: { mux: 'tmux', id: '%9' },
		...rec,
	}
	saveAgent(store, full)
	// bind the pane pointer too — a unit is addressable by its pane, and a reset that dropped that
	// binding would strand it while leaving the record looking untouched
	if (full.pane) store.putPaneIndex(full.pane.id, full.id)
	return full
}

describe('resetCommandFor — the per-harness reset map', () => {
	it.each([
		['claude', '/clear'],
		['codex', '/clear'],
		['copilot', '/clear'],
		['cursor', '/new-chat'],
	])('resolves %s to %s', (harness, command) => {
		expect(resetCommandFor(harness)).toBe(command)
	})

	it('throws naming gemini and its missing honest reset, for the known false-friend harness', () => {
		expect(() => resetCommandFor('gemini')).toThrow(/gemini/)
		expect(() => resetCommandFor('gemini')).toThrow(/context/)
	})

	it('throws naming the reset map for a truly unmapped harness', () => {
		expect(() => resetCommandFor('grok')).toThrow(/grok/)
		expect(() => resetCommandFor('grok')).toThrow(/reset map/)
	})
})

describe('clear injects the harness reset into a warm peer and tears nothing down', () => {
	it('sends "/clear" to a claude peer, leaving its record, pane, and worktree unchanged', () => {
		// A REAL worktree on disk, so "no worktree is removed" is observed on the filesystem and not
		// only as an un-issued git command.
		const liveWorktree = mkdtempSync(join(tmpdir(), 'cl-warm-'))
		registerUnit({ id: 'w1', worktree: { root: liveWorktree, branch: 'cyberlegion/unit-w1' } })
		const res = clearUnit(ctx(), 'w1')
		expect(res).toEqual({ agent: expect.objectContaining({ id: 'w1' }), pane: '%9', command: '/clear' })
		expect(existsSync(liveWorktree)).toBe(true)
		// cyber-mux's `submit(text)` composes two tmux calls: a literal `-l` type, then a bare Enter.
		expect(sent.at(-2)).toEqual(['send-keys', '-t', '%9', '-l', '/clear'])
		expect(sent.at(-1)).toEqual(['send-keys', '-t', '%9', 'Enter'])
		// nothing torn down — no teardown or worktree removal was even ISSUED. Asserting only that
		// the record still looks right cannot see a kill-pane or a `git worktree remove` that the
		// fake backend happily accepts.
		expect(allCalls.some((c) => c[0] === 'tmux' && ['kill-pane', 'kill-session', 'kill-window'].includes(c[1]!))).toBe(
			false,
		)
		expect(allCalls.some((c) => c[0] === 'git' && c.includes('worktree') && c.includes('remove'))).toBe(false)
		// the pane POINTER survives too — the record can look untouched while the index that
		// addresses it is dropped, which strands the unit exactly as a teardown would
		expect(store.resolvePaneId('%9')).toBe('w1')
		const rec = loadAgent(store, 'w1')
		expect(rec).toMatchObject({ id: 'w1', status: 'active', pane: { mux: 'tmux', id: '%9' } })
		expect(rec?.worktree).toEqual({ root: liveWorktree, branch: 'cyberlegion/unit-w1' })
	})
})

describe('clear resolves each harness own fresh-context command from the per-harness map', () => {
	it.each([
		['claude', '/clear'],
		['codex', '/clear'],
		['copilot', '/clear'],
		['cursor', '/new-chat'],
	])('sends "%s" for harness %s', (harness, command) => {
		registerUnit({ id: `h-${harness}`, harness: harness as Harness })
		const res = clearUnit(ctx(), `h-${harness}`)
		expect(res.command).toBe(command)
		expect(sent.at(-2)).toEqual(['send-keys', '-t', '%9', '-l', command])
		expect(sent.at(-1)).toEqual(['send-keys', '-t', '%9', 'Enter'])
	})
})

describe('clear fails loud on a harness whose reset would not truly empty the context', () => {
	it('throws naming gemini and sends nothing to its pane', () => {
		registerUnit({ id: 'gem1', harness: 'gemini' as Harness })
		expect(() => clearUnit(ctx(), 'gem1')).toThrow(/gemini/)
		expect(sent).toHaveLength(0)
	})
})

describe('clear errors on an unmapped harness rather than guessing a command', () => {
	it('throws naming the reset map and sends nothing to its pane', () => {
		registerUnit({ id: 'grok1', harness: 'grok' as Harness })
		expect(() => clearUnit(ctx(), 'grok1')).toThrow(/reset map/)
		expect(sent).toHaveLength(0)
	})
})

describe('clear on a record with an empty harness field fails loud before resolving a command', () => {
	it('throws that the unit has no harness on record and sends nothing to any pane', () => {
		// An empty string is not an unmapped harness: `resetCommandFor('')` would report "not in the
		// reset map", naming nothing the operator can act on. And a falsy harness passed through to a
		// lookup that defaulted would type SOME reset into a live pane.
		registerUnit({ id: 'nohar1', harness: '' as Harness })
		expect(() => clearUnit(ctx(), 'nohar1')).toThrow(/no harness on record/)
		expect(sent).toHaveLength(0)
	})
})

describe('clear on an unresolvable ref errors and sends nothing', () => {
	it('throws that no unit is addressable under that ref', () => {
		expect(() => clearUnit(ctx(), 'ghost')).toThrow(/no agent addressable/)
		expect(sent).toHaveLength(0)
	})
})

describe('clear on a unit with no known session pane errors and sends nothing', () => {
	it('throws that the unit has no known session pane', () => {
		registerUnit({ id: 'nopane1', pane: null })
		expect(() => clearUnit(ctx(), 'nopane1')).toThrow(/no known session pane/)
		expect(sent).toHaveLength(0)
	})
})

// The handoff itself — which placements open under a resolved name — is the mux node's contract; what
// the name SAYS is unit/lifecycle's (workspace-label.test.ts). These bind the mux scenarios.
describe('spec:cyberlegion/mux', () => {
	function herdrLabelExec(calls: string[][], worktreeRoot: string): Exec {
		return (cmd, args) => {
			if (cmd === 'git') {
				if (args.includes('--git-common-dir')) return `${primaryRoot}/.git`
				if (args.includes('worktree')) return ''
				return null
			}
			calls.push(args)
			if (args[0] === 'worktree' && args[1] === 'create') {
				const branch = args[args.indexOf('--branch') + 1]
				return JSON.stringify({
					result: {
						root_pane: { pane_id: 'w9:p1', tab_id: 'w9:tT' },
						worktree: { branch, path: worktreeRoot },
						workspace: { workspace_id: 'w9' },
					},
				})
			}
			if (args[0] === 'tab' && args[1] === 'create') {
				return JSON.stringify({ result: { root_pane: { pane_id: 'w3:pT', tab_id: 'w3:pT' } } })
			}
			return null
		}
	}

	it('a workspace placement opens under the label the legion resolved', () => {
		const calls: string[][] = []
		const worktreeRoot = join(dirname(primaryRoot), 'labeled-unit')
		spawn(
			{ store, env: { CYBER_MUX: 'herdr' }, exec: herdrLabelExec(calls, worktreeRoot), now: () => 1 },
			{ harness: 'claude', task: 'audit the governance provenance check', at: 'workspace' },
		)
		// Asserted as "the name reached the space-opening call", never as a flag spelling — how a
		// backend writes a name onto its own tier is the multiplexer package's business, not this one's.
		expect(calls[0]!.slice(0, 2)).toEqual(['worktree', 'create'])
		expect(calls[0]).toContain('9S-governance-provenance-check')
	})

	it('a pane or tab placement carries no name at all', () => {
		const calls: string[][] = []
		const worktreeRoot = join(dirname(primaryRoot), 'tabbed-unit')
		spawn(
			{ store, env: { CYBER_MUX: 'herdr' }, exec: herdrLabelExec(calls, worktreeRoot), now: () => 1 },
			// The same brief that names a workspace above — so what differs is the placement, not the brief.
			{ harness: 'claude', task: 'audit the governance provenance check', at: 'tab' },
		)
		expect(calls[0]!.slice(0, 2)).toEqual(['tab', 'create'])
		expect(calls[0]!.some((a) => a.startsWith('9S-'))).toBe(false)
	})
})

// spec: unit/lifecycle/lifecycle.feature — focus / nudge / read against a peer's live pane.
// These verbs were composed inline in the CLI with a hardcoded realExec, so nothing could drive
// them and every success-path scenario stayed mutable while green (only the error branches were
// covered e2e). They now go through focusUnit/nudgeUnit/readUnit, which honor ctx.exec, so a fake
// exec drives the real tmux adapter end to end.
describe('spec:cyberlegion/unit/lifecycle focus, nudge and read a live peer', () => {
	const PANE = '%9'
	const LOCATIONS = `${PANE} peersession @3\n%1 callersession @1`

	/** A registered peer holding a live tmux pane, plus a fake exec driving the real adapter. */
	function peerCtx(opts: { locations?: string; captures?: string[] } = {}) {
		const calls: string[][] = []
		const captures = [...(opts.captures ?? [''])]
		const exec: Exec = (cmd, args) => {
			calls.push([cmd, ...args])
			if (cmd !== 'tmux') return null
			// `paneExists` probes with a bare pane-id format; `focus` asks for the full location.
			if (args[0] === 'list-panes') {
				return args.includes('#{pane_id} #{session_name} #{window_id}')
					? (opts.locations ?? LOCATIONS)
					: (opts.locations ?? LOCATIONS)
							.split('\n')
							.map((l) => l.split(' ')[0])
							.join('\n')
			}
			if (args[0] === 'has-session') return ''
			if (args[0] === 'capture-pane') return captures.length > 1 ? (captures.shift() ?? '') : (captures[0] ?? '')
			return null
		}
		saveAgent(store, {
			id: 'peer1',
			handle: 'peer',
			harness: 'claude',
			cwd: '/tmp',
			pane: { mux: 'tmux', id: PANE },
			status: 'active',
			createdAt: 'x',
			lastSeen: 'x',
		})
		return { calls, ctx: { store, env: { TMUX: 't', CYBERLEGION_AGENT_ID: 'caller' }, exec } as IdContext }
	}

	const tmuxArgs = (calls: string[][], verb: string) => calls.filter((c) => c[0] === 'tmux' && c[1] === verb)
	/** The pane an argv is aimed at — read by name, since -t sits at a different index per verb. */
	const targetOf = (argv: string[] | undefined) => (argv ? argv[argv.indexOf('-t') + 1] : undefined)

	it('focus moves input focus to a peer pane', () => {
		const { calls, ctx } = peerCtx()
		expect(focusUnit(ctx, 'peer').pane).toBe(PANE)
		expect(tmuxArgs(calls, 'select-pane').at(-1)).toEqual(['tmux', 'select-pane', '-t', PANE])
	})

	it('focus beams the attached client across workspace and tab, in that order, to the peer pane', () => {
		const { calls, ctx } = peerCtx()
		focusUnit(ctx, 'peer')
		// it resolves the pane's OWN workspace and tab from the backend...
		expect(tmuxArgs(calls, 'list-panes').length).toBeGreaterThan(0)
		// ...then switches workspace, then tab, then lands focus — the order is the contract, and it
		// targets the PEER's session/window, never no-opping in the caller's own.
		const order = calls
			.filter((c) => c[0] === 'tmux' && ['switch-client', 'select-window', 'select-pane'].includes(c[1]))
			.map((c) => [c[1], c[3]])
		expect(order).toEqual([
			['switch-client', 'peersession'],
			['select-window', '@3'],
			['select-pane', PANE],
		])
	})

	it('focus surfaces an error instead of a false success when the recorded pane no longer resolves', () => {
		// the backend no longer knows this pane — distinct from an unresolvable ref or no recorded pane
		const { calls, ctx } = peerCtx({ locations: '%1 callersession @1' })
		// it says the pane could not be RESOLVED — a bare toThrow() passes on any error at all,
		// including one that has nothing to do with beaming
		// it must name the RESOLUTION failure. `/pane|resolve/i` also accepts the sibling scenario's
		// "no known session pane", which is false here — a pane IS recorded; the backend lost it.
		expect(() => focusUnit(ctx, 'peer')).toThrow(/resolve/i)
		expect(() => focusUnit(ctx, 'peer')).not.toThrow(/no known session pane/)
		// ...and nothing was switched: no workspace, no tab, no pane
		expect(tmuxArgs(calls, 'switch-client')).toEqual([])
		expect(tmuxArgs(calls, 'select-window')).toEqual([])
		expect(tmuxArgs(calls, 'select-pane')).toEqual([])
	})

	it('nudge delivers the default check-mail doorbell to the peer pane', async () => {
		const { calls, ctx } = peerCtx({ captures: ['idle, nothing staged'] })
		const res = await nudgeUnit(ctx, 'peer', { nudgeOpts: { sleep: async () => {} } })
		expect(res.message).toBe(DELIVERY_DOORBELL)
		// The default must actually be a CHECK-MAIL doorbell. Comparing it to itself is a tautology:
		// `DELIVERY_DOORBELL` could be reworded to 'ping', or inverted to "ignore your inbox", and
		// every such assertion still passes. Bind the semantics independently, as spawnDoorbell is.
		expect(res.message).toMatch(/\bcheck\b[\s\S]*\binbox\b/i)
		// ...and it is not the NEGATION of one: "do not check your inbox" keeps both keywords in
		// order, so the keyword bar alone does not settle the clause.
		expect(res.message).not.toMatch(/\b(?:do not|don'?t|never|ignore|skip|avoid)\s+check\b/i)
		// ...and it is delivered to THE PEER'S pane, not merely typed somewhere
		const ring = calls.find((c) => c[1] === 'send-keys' && c.includes('-l'))
		expect(targetOf(ring)).toBe(PANE)
		expect(ring?.at(-1)).toBe(DELIVERY_DOORBELL)
	})

	it('a peer whose record carries no pane locator is reached through the pane index', () => {
		// The herdr route: the record holds no pane, so the only way to the live target is the index.
		// A resolution that read only `agent.pane` throws "no known session pane" here.
		const herdrCalls: string[][] = []
		const exec: Exec = (cmd, args) => {
			if (cmd !== 'herdr') return null
			herdrCalls.push(args)
			if (args[0] === 'pane' && args[1] === 'get') {
				return JSON.stringify({ result: { pane: { pane_id: 'herdr-pane-1', tab_id: 'w3:tT', workspace_id: 'w3' } } })
			}
			return null
		}
		saveAgent(store, {
			id: 'idx1',
			handle: 'indexed',
			harness: 'claude',
			cwd: '/tmp',
			pane: null,
			status: 'active',
			createdAt: 'x',
			lastSeen: 'x',
		})
		store.putPaneIndex('herdr-pane-1', 'idx1')
		const res = focusUnit({ store, env: { HERDR_ENV: '1' }, exec }, 'indexed')
		expect(res.pane).toBe('herdr-pane-1')
		// ...and the pane the INDEX named is the one the adapter was pointed at
		expect(herdrCalls[0]).toEqual(['pane', 'get', 'herdr-pane-1'])
	})

	it('an empty --message falls back to the default check-mail doorbell', async () => {
		// Commander hands through `--message ""` as an empty string, not as an absent option. A
		// nullish-coalescing default (`?? DELIVERY_DOORBELL`) keeps the empty string and rings a
		// doorbell carrying no text at all — a no-op ring that reports success.
		const { calls, ctx } = peerCtx({ captures: ['idle, nothing staged'] })
		const res = await nudgeUnit(ctx, 'peer', { message: '', nudgeOpts: { sleep: async () => {} } })
		expect(res.message).toBe(DELIVERY_DOORBELL)
		const ring = calls.find((c) => c[1] === 'send-keys' && c.includes('-l'))
		expect(ring?.at(-1)).toBe(DELIVERY_DOORBELL)
		expect(targetOf(ring)).toBe(PANE)
	})

	it('nudge on a pane the backend no longer knows fails naming the gone pane', async () => {
		// A gone pane and a booting one are different failures with different fixes, so the retry cap
		// must not absorb the first: `paneExists` is probed up front and rejected outright.
		const { ctx } = peerCtx()
		// the backend knows no such pane at all: neither the session probe nor the server-wide pane
		// scan finds it
		const goneCtx: IdContext = {
			...ctx,
			exec: (cmd, args) => {
				if (cmd === 'tmux' && args[0] === 'has-session') return null
				if (cmd === 'tmux' && args[0] === 'list-panes') return '%1'
				return null
			},
		}
		const err = await nudgeUnit(goneCtx, 'peer', { nudgeOpts: { attempts: 2, sleep: async () => {} } }).catch(
			(e) => e as Error,
		)
		expect(err.message).toMatch(/no longer exists/)
		// ...and NOT the retry-cap message: that one tells the caller to wait for a boot that will
		// never happen, against a pane that is simply gone.
		expect(err.message).not.toMatch(/never took the turn/)
	})

	it('nudge carries a caller-supplied message with --message', async () => {
		const { calls, ctx } = peerCtx({ captures: ['idle, nothing staged'] })
		const res = await nudgeUnit(ctx, 'peer', { message: 'ship the release', nudgeOpts: { sleep: async () => {} } })
		expect(res.message).toBe('ship the release')
		const typed = calls.flat().join(' ')
		expect(typed).toContain('ship the release')
		expect(typed).not.toContain(DELIVERY_DOORBELL) // the default is replaced, not appended
		// ...delivered to the peer's pane, not merely typed somewhere
		const ring = calls.find((c) => c[1] === 'send-keys' && c.includes('-l'))
		expect(targetOf(ring)).toBe(PANE)
		expect(ring?.at(-1)).toBe('ship the release')
	})

	it('nudge confirms the turn was taken and reports success without re-submitting', async () => {
		// the pane comes back with the text gone — the turn was taken on the first submit
		const { ctx } = peerCtx({ captures: ['scrolled away\n> '] })
		const res = await nudgeUnit(ctx, 'peer', { nudgeOpts: { sleep: async () => {} } })
		expect(res.resubmits).toBe(0) // it issues no re-submit
	})

	it('nudge re-submits when the harness boot swallows the first submit', async () => {
		// first read shows the text still staged at the prompt, second shows it taken
		const { ctx } = peerCtx({ captures: [`> ${DELIVERY_DOORBELL}`, 'scrolled away\n> '] })
		const res = await nudgeUnit(ctx, 'peer', { nudgeOpts: { sleep: async () => {} } })
		expect(res.resubmits).toBeGreaterThan(0) // reports success only once no longer staged
	})

	it('a boot-race re-submit flushes the staged buffer rather than re-typing the message', async () => {
		const { calls, ctx } = peerCtx({ captures: [`> ${DELIVERY_DOORBELL}`, 'scrolled away\n> '] })
		await nudgeUnit(ctx, 'peer', { nudgeOpts: { sleep: async () => {} } })
		// the literal text is typed exactly once; the recovery is a bare Enter, so the peer's turn
		// carries the message once rather than twice
		const typedLiteral = calls.filter((c) => c[0] === 'tmux' && c[1] === 'send-keys' && c.includes('-l'))
		expect(typedLiteral).toHaveLength(1)
	})

	it('nudge fails loud when the turn is never taken within the bounded retry cap', async () => {
		const { ctx } = peerCtx({ captures: [`> ${DELIVERY_DOORBELL}`] }) // stays staged forever
		await expect(nudgeUnit(ctx, 'peer', { nudgeOpts: { attempts: 2, sleep: async () => {} } })).rejects.toThrow(
			/never took the turn/,
		)
	})

	// The guard clause every one of these verbs carries: "errors and {focuses,delivers,scrapes}
	// nothing". Covered elsewhere only where no multiplexer is reachable at all, which cannot
	// distinguish "refused before acting" from "could not have acted" — so each verb is driven here
	// against a live backend with a peer that has no recorded pane.
	/** Acts ON a pane. A backend probe or capability query is not one, and the contract permits it. */
	const paneActs = (calls: string[][]) =>
		calls.filter((c) =>
			['send-keys', 'capture-pane', 'select-pane', 'select-window', 'switch-client', 'kill-pane'].includes(c[1] ?? ''),
		)

	it.each([
		['focus', 'nopane', (ctx: IdContext, r: string) => focusUnit(ctx, r), /no known session pane/],
		['read', 'nopane', (ctx: IdContext, r: string) => readUnit(ctx, r), /no known session pane/],
		[
			'nudge',
			'nopane',
			(ctx: IdContext, r: string) => nudgeUnit(ctx, r, { nudgeOpts: { sleep: async () => {} } }),
			/no known session pane/,
		],
		['focus', 'ghost', (ctx: IdContext, r: string) => focusUnit(ctx, r), /no agent addressable/],
		['read', 'ghost', (ctx: IdContext, r: string) => readUnit(ctx, r), /no agent addressable/],
		[
			'nudge',
			'ghost',
			(ctx: IdContext, r: string) => nudgeUnit(ctx, r, { nudgeOpts: { sleep: async () => {} } }),
			/no agent addressable/,
		],
	])('%s on an unaddressable ref (%s) errors and touches no pane', async (_verb, ref, run, message) => {
		const { calls, ctx } = peerCtx()
		saveAgent(store, {
			id: 'nopane1',
			handle: 'nopane',
			harness: 'claude',
			cwd: '/tmp',
			pane: null,
			status: 'active',
			createdAt: 'x',
			lastSeen: 'x',
		})
		await expect(async () => await run(ctx, ref)).rejects.toThrow(message)
		expect(paneActs(calls)).toEqual([]) // nothing was focused, delivered or scraped
	})

	it('read scrapes the peer trailing session output and honors --lines', () => {
		const { calls, ctx } = peerCtx({ captures: ['line one\nline two\nline three'] })
		const res = readUnit(ctx, 'peer', { lines: 20 })
		expect(res.output).toBe('line one\nline two\nline three') // the captured output is what is returned
		const capture = tmuxArgs(calls, 'capture-pane').at(-1) ?? []
		expect(targetOf(capture)).toBe(PANE) // scraped from THAT peer's pane, not merely from some pane
		expect(capture).toContain('-S') // the --lines wire actually reaches the adapter
		expect(capture).toContain('-20')
	})

	it("read with no --lines asks the adapter for the backend's own default capture", () => {
		// A default filled in here (say 100) would silently cap every unbounded read. The bound must
		// be ABSENT from the capture call, not merely different from 20.
		const { calls, ctx } = peerCtx({ captures: ['line one\nline two'] })
		const res = readUnit(ctx, 'peer')
		expect(res.output).toBe('line one\nline two')
		const capture = tmuxArgs(calls, 'capture-pane').at(-1) ?? []
		expect(targetOf(capture)).toBe(PANE)
		expect(capture).not.toContain('-S')
	})
})
