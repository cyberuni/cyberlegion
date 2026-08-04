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

let store: FileStore
let sent: string[][]
let worktreeAddCalls: string[][]
// The real "primary checkout" — writable, since spawn actually mkdir's the worktree marker under
// it; `git` itself is faked via `fakeExec` below, so no real git repo is required here.
let primaryRoot: string

beforeEach(() => {
	store = new FileStore(join(mkdtempSync(join(tmpdir(), 'cl-')), 'hub'))
	primaryRoot = mkdtempSync(join(tmpdir(), 'cl-primary-'))
	sent = []
	worktreeAddCalls = []
})

// tmux `open` asks for `#{pane_id}\t#{window_id}` (tab-separated — `OpenedPane.tab` is required).
const fakeExec: Exec = (cmd, args) => {
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

const expectedWorktreePath = (id: string) =>
	resolve(join(dirname(primaryRoot), `${basename(primaryRoot)}.worktrees`, `legion-${id.slice(0, 6)}`))

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
		expect(typed).toMatch(/read\s+(your\s+)?brief\s+at\s+\S+.*\b(then|and)\s+begin\b/i)
		// ...and the path it names must be where the brief ACTUALLY IS. Asserting only that the text
		// contains `res.agent.brief` is a self-set bar — that field is written by the very code under
		// test, and the store keys briefs by agent id, so the two can diverge and the peer gets rung
		// with a path to a file that is not there (the exact failure ADR-0032 exists to prevent).
		expect(res.agent.brief).toBeTruthy()
		expect(typed).toContain(res.agent.brief)
		// Containment alone is too weak: a doorbell naming a DECORATED superstring of the real path
		// ("<brief>.bak", or the path shell-quoted) contains it while pointing at a file that does
		// not exist. Pull the path back out of the doorbell text and read it.
		const named = /at\s+(.+?),\s*then begin/i.exec(typed)?.[1]
		expect(named).toBe(res.agent.brief)
		expect(readFileSync(named as string, 'utf8')).toBe(TASK)
		// ...and the brief's body is never typed into the pane, only its path
		expect(typed).not.toContain(TASK)
		expect(store.readBrief(res.agent.id)).toBe(TASK)
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
		// nothing rung — and nothing typed at the pane naming the brief
		expect(res.rung).toBe(false)
		expect(sent.flat().join(' ')).not.toContain(res.agent.brief)
		// ...but the spawn itself still landed in full: registered peer, pane, brief on disk
		expect(loadAgent(store, res.agent.id)).toBeTruthy()
		expect(res.pane).toBe('%9')
		expect(store.readBrief(res.agent.id)).toBe(TASK)
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

describe('spawn errors', () => {
	it('errors on an unmapped harness without launching', () => {
		expect(() => spawn(ctx(), { harness: 'grok', task: 't' })).toThrow(/launch map/)
		// ...and it errors BEFORE anything is opened — no worktree created, no session launched
		expect(worktreeAddCalls).toEqual([])
		expect(sent).toEqual([])
	})
	it('errors when no brief source is supplied', () => {
		expect(() => spawn(ctx(), { harness: 'claude' })).toThrow(/brief/)
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

	it('defaults the branch to cyberlegion/unit-<id>', () => {
		const res = spawn(ctx(), { harness: 'claude', task: 't', at: 'pane:right' })
		expect(res.agent.worktree?.branch).toBe(`cyberlegion/unit-${res.agent.id}`)
	})

	it('stamps the new worktree-unit with its own tracked marker so it self-detects', () => {
		const res = spawn(ctx(), { harness: 'claude', task: 't', at: 'pane:right' })
		const marker = join(res.agent.worktree!.root, '.agents', 'cyberlegion', 'config.json')
		expect(existsSync(marker)).toBe(true)
	})
})

describe('refusing the primary checkout', () => {
	it('throws a clear error rather than opening a session in the primary', () => {
		const exec: Exec = (cmd, args) => {
			if (cmd === 'git') {
				if (args.includes('--git-common-dir')) return `${primaryRoot}/.git`
				if (args.includes('worktree')) return ''
				return null
			}
			return null
		}
		expect(() =>
			spawn({ store, env: { TMUX: 't' }, exec }, { harness: 'claude', task: 't', worktreePath: primaryRoot }),
		).toThrow(/primary checkout/)
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
	})

	it('refuses the primary checkout the same as a created worktree', () => {
		expect(() => spawn(ctx(), { harness: 'claude', task: 't', cwd: primaryRoot })).toThrow(/primary checkout/)
		expect(sent).toHaveLength(0)
	})

	it('is mutually exclusive with --worktree-path', () => {
		const existingDir = mkdtempSync(join(tmpdir(), 'cl-existing-'))
		expect(() =>
			spawn(ctx(), { harness: 'claude', task: 't', cwd: existingDir, worktreePath: join(existingDir, 'wt') }),
		).toThrow(/cannot combine/)
		expect(worktreeAddCalls).toHaveLength(0)
		expect(sent).toHaveLength(0)
	})

	it('is mutually exclusive with --branch', () => {
		const existingDir = mkdtempSync(join(tmpdir(), 'cl-existing-'))
		expect(() => spawn(ctx(), { harness: 'claude', task: 't', cwd: existingDir, branch: 'some-branch' })).toThrow(
			/cannot combine/,
		)
		expect(worktreeAddCalls).toHaveLength(0)
		expect(sent).toHaveLength(0)
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
		registerUnit({ id: 'w1' })
		const res = clearUnit(ctx(), 'w1')
		expect(res).toEqual({ agent: expect.objectContaining({ id: 'w1' }), pane: '%9', command: '/clear' })
		// cyber-mux's `submit(text)` composes two tmux calls: a literal `-l` type, then a bare Enter.
		expect(sent.at(-2)).toEqual(['send-keys', '-t', '%9', '-l', '/clear'])
		expect(sent.at(-1)).toEqual(['send-keys', '-t', '%9', 'Enter'])
		// nothing torn down — record, pane index binding, and worktree are exactly as registered
		const rec = loadAgent(store, 'w1')
		expect(rec).toMatchObject({ id: 'w1', status: 'active', pane: { mux: 'tmux', id: '%9' } })
		expect(rec?.worktree).toEqual({ root: '/somewhere', branch: 'cyberlegion/unit-w1' })
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
		expect(() => focusUnit(ctx, 'peer')).toThrow()
		// ...and nothing was switched: no workspace, no tab, no pane
		expect(tmuxArgs(calls, 'switch-client')).toEqual([])
		expect(tmuxArgs(calls, 'select-window')).toEqual([])
		expect(tmuxArgs(calls, 'select-pane')).toEqual([])
	})

	it('nudge delivers the default check-mail doorbell to the peer pane', async () => {
		const { calls, ctx } = peerCtx({ captures: ['idle, nothing staged'] })
		const res = await nudgeUnit(ctx, 'peer', { nudgeOpts: { sleep: async () => {} } })
		expect(res.message).toBe(DELIVERY_DOORBELL)
		expect(calls.flat().join(' ')).toContain(DELIVERY_DOORBELL)
	})

	it('nudge carries a caller-supplied message with --message', async () => {
		const { calls, ctx } = peerCtx({ captures: ['idle, nothing staged'] })
		const res = await nudgeUnit(ctx, 'peer', { message: 'ship the release', nudgeOpts: { sleep: async () => {} } })
		expect(res.message).toBe('ship the release')
		const typed = calls.flat().join(' ')
		expect(typed).toContain('ship the release')
		expect(typed).not.toContain(DELIVERY_DOORBELL) // the default is replaced, not appended
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

	it('read scrapes the peer trailing session output and honors --lines', () => {
		const { calls, ctx } = peerCtx({ captures: ['line one\nline two\nline three'] })
		const res = readUnit(ctx, 'peer', { lines: 20 })
		expect(res.output).toBe('line one\nline two\nline three') // the captured output is what is returned
		const capture = tmuxArgs(calls, 'capture-pane').at(-1) ?? []
		expect(capture).toContain('-S') // the --lines wire actually reaches the adapter
		expect(capture).toContain('-20')
	})
})
