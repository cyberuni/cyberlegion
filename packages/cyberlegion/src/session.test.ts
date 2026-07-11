import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { type AgentRecord, type Exec, type Harness, type IdContext, loadAgent, saveAgent } from './identity.ts'
import { clearUnit, resetCommandFor, resolveBrief, spawn } from './session.ts'
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

const fakeExec: Exec = (cmd, args) => {
	if (cmd === 'git') {
		if (args.includes('--git-common-dir')) return `${primaryRoot}/.git`
		if (args.includes('worktree')) {
			worktreeAddCalls.push(args)
			return ''
		}
		return null
	}
	if (args[0] === 'split-window') return '%9'
	if (args[0] === 'send-keys') sent.push(args)
	return null
}

function ctx(): IdContext {
	return { store, env: { TMUX: 't', CYBERLEGION_AGENT_ID: 'spawner' }, exec: fakeExec, now: () => 1_700_000_000_000 }
}

const expectedWorktreePath = (id: string) =>
	resolve(join(dirname(primaryRoot), `${basename(primaryRoot)}.worktrees`, `legion-${id.slice(0, 6)}`))

describe('spawn opens a pane + pre-registers the peer', () => {
	it('registers the peer (spawning, pane, spawnedBy) and writes its brief', () => {
		const res = spawn(ctx(), { harness: 'claude', task: 'reply to alice', handle: 'bob', at: 'pane:right' })
		expect(res.pane).toBe('%9')
		const rec = loadAgent(store, res.agent.id)
		expect(rec).toMatchObject({ harness: 'claude', status: 'spawning', spawnedBy: 'spawner' })
		expect(rec?.pane).toEqual({ mux: 'tmux', id: '%9' })
		expect(store.resolvePaneId('%9')).toBe(res.agent.id)
		expect(store.readBrief(res.agent.id)).toBe('reply to alice')
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
		// inherits it and never re-runs its own ancestry discovery.
		expect(sent.at(-1)).toEqual([
			'send-keys',
			'-t',
			'%9',
			`CYBERLEGION_MUX=tmux CYBERLEGION_MUX_PANE=$TMUX_PANE ${launch}`,
			'Enter',
		])
	})
})

describe('spawn errors', () => {
	it('errors on an unmapped harness without launching', () => {
		expect(() => spawn(ctx(), { harness: 'grok', task: 't' })).toThrow(/launch map/)
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
				return '%9'
			}
			return null
		}
		const res = spawn(
			{ store, env: { TMUX: 't' }, exec, now: () => 1 },
			{ harness: 'claude', task: 't', at: 'pane:right' },
		)
		const expectedPath = expectedWorktreePath(res.agent.id)
		expect(openCalls[0]).toEqual(['split-window', '-h', '-c', expectedPath, '-P', '-F', '#{pane_id}'])
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
				return '%9'
			}
			return null
		}
		spawn(
			{ store, env: { TMUX: 't' }, exec, now: () => 1 },
			{ harness: 'claude', task: 't', cwd: existingDir, at: 'pane:right' },
		)
		expect(openCalls[0]).toEqual(['split-window', '-h', '-c', resolve(existingDir), '-P', '-F', '#{pane_id}'])
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
						result: { pane: { pane_id: 'herdr-pane-1' }, type: 'pane_info' },
					})
				}
				return null
			}
			return null
		}
		const res = spawn({ store, env: { HERDR_ENV: '1' }, exec }, { harness: 'claude', task: 't', at: 'pane:right' })
		expect(res.pane).toBe('herdr-pane-1')
		expect(herdrCalls[0]).toEqual(['pane', 'split', '--current', '--direction', 'right', '--cwd', res.agent.cwd])
		expect(herdrCalls[1]).toEqual(['pane', 'run', 'herdr-pane-1', 'CYBERLEGION_MUX=herdr claude'])
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
					result: { root_pane: { pane_id: 'w9:p1' }, worktree: { branch, path: worktreeRoot } },
				})
			}
			return null
		}
		const res = spawn(
			{ store, env: { CYBERLEGION_MUX: 'herdr' }, exec, now: () => 1 },
			{ harness: 'claude', task: 't', at: 'workspace' },
		)
		expect(gitWorktreeCalls).toHaveLength(0)
		expect(herdrCalls[0]!.slice(0, 2)).toEqual(['worktree', 'create'])
		expect(res.agent.worktree).toEqual({ root: resolve(worktreeRoot), branch: `cyberlegion/unit-${res.agent.id}` })
		expect(res.agent.cwd).toBe(resolve(worktreeRoot))
		expect(res.pane).toBe('w9:p1')
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
		expect(sent.at(-1)).toEqual(['send-keys', '-t', '%9', '/clear', 'Enter'])
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
		expect(sent.at(-1)).toEqual(['send-keys', '-t', '%9', command, 'Enter'])
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

describe('clear on an unknown id errors and sends nothing', () => {
	it('throws that no unit is registered under that id', () => {
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
