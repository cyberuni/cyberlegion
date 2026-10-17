import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Exec } from 'cyber-mux'
import { beforeEach, describe, expect, it } from 'vitest'
import { fakeClaude } from './fake-claude.test-util.ts'
import { selectSessionAdapter } from './mux-select.ts'
import { spawn } from './session.ts'
import { FileStore } from './store/file-store.ts'

const nullExec: Exec = () => null

// spec: mux/mux.feature — "the session backend is selected by environment", "neither tmux nor herdr
// detected errors before opening anything", and "a detected backend a unit record cannot carry is
// refused before opening anything". This GUARD is cyberlegion's own replacement for the fork's
// `selectSessionAdapter` — cyber-mux itself happily drives wezterm/zellij, so the refusal has to live
// here, before `unit spawn` ever calls `.open()`.
describe('spec:cyberlegion/mux', () => {
	it('binds the tmux adapter when $TMUX is set', () => {
		expect(selectSessionAdapter({ TMUX: 't' }, nullExec).name).toBe('tmux')
	})

	it('binds the herdr adapter when $HERDR_ENV is set and no $TMUX', () => {
		expect(selectSessionAdapter({ HERDR_ENV: '1' }, nullExec).name).toBe('herdr')
	})

	it('throws naming tmux/herdr when neither is detected', () => {
		expect(() => selectSessionAdapter({}, nullExec)).toThrow(/tmux/)
		expect(() => selectSessionAdapter({}, nullExec)).toThrow(/herdr/)
	})

	it.each(['wezterm', 'zellij'] as const)(
		'refuses a detected %s outright, naming it as detected-but-unsupported',
		(mux) => {
			expect(() => selectSessionAdapter({ CYBER_MUX: mux }, nullExec)).toThrow(new RegExp(mux))
		},
	)

	it('the legacy $CYBERLEGION_MUX fast-path still selects a backend via the transitional env seam', () => {
		expect(selectSessionAdapter({ CYBERLEGION_MUX: 'herdr' }, nullExec).name).toBe('herdr')
	})

	it('the current $CYBER_MUX pair wins over the legacy pair when both are set', () => {
		expect(selectSessionAdapter({ CYBER_MUX: 'tmux', CYBERLEGION_MUX: 'herdr' }, nullExec).name).toBe('tmux')
	})
})

// spec: mux/mux.feature — the spawn-level backend selection keyed on the harness (ADR-0036). Driven
// through `spawn` itself, boundary level: Claude Code and the multiplexers answer at the `Exec` seam
// (`fake-claude.test-util.ts`). A `--cwd` spawn keeps the worktree library out of it.
describe('spec:cyberlegion/mux — the background session for a claude spawn with no multiplexer', () => {
	let store: FileStore
	let primaryRoot: string
	let folder: string
	beforeEach(() => {
		const tmp = mkdtempSync(join(tmpdir(), 'cl-mux-bg-'))
		store = new FileStore(join(tmp, 'hub'))
		primaryRoot = join(tmp, 'repo')
		folder = join(tmp, 'folder')
		mkdirSync(primaryRoot)
		mkdirSync(folder)
	})

	const tmuxVerb = (args: readonly string[]) => (args[0] === '-u' ? args[1] : args[0])
	function backends() {
		return fakeClaude({
			other: (cmd, args) => {
				if (cmd === 'git' && args.includes('--git-common-dir')) return `${primaryRoot}/.git`
				if (cmd === 'tmux' && (tmuxVerb(args) === 'new-window' || tmuxVerb(args) === 'split-window')) return '%9\t@1'
				return null
			},
		})
	}
	const spawnWith = (env: NodeJS.ProcessEnv, exec: Exec, harness: string) =>
		spawn({ store, env, exec }, { harness, task: 't', cwd: folder })

	it.each(['cursor', 'codex'])(
		'a non-claude spawn with neither tmux nor herdr detected errors before opening anything (%s)',
		async (harness) => {
			const fake = backends()
			await expect(spawnWith({}, fake.exec, harness)).rejects.toThrow(/tmux.*herdr/)
			expect(fake.starts()).toEqual([])
		},
	)

	it('a claude spawn with neither tmux nor herdr detected runs in a Claude background session', async () => {
		const fake = backends()
		const res = await spawnWith({}, fake.exec, 'claude')
		expect(fake.starts()).toHaveLength(1)
		expect(store.getAgent(res.agent.id)?.pane?.mux).toBe('claude-bg')
	})

	it('a detected multiplexer wins over the background session for a claude spawn', async () => {
		const fake = backends()
		const res = await spawnWith({ TMUX: '/tmp/tmux-1/default,1,0' }, fake.exec, 'claude')
		expect(fake.muxCalls().some((c) => c[0] === 'tmux' && tmuxVerb(c.slice(1)) === 'new-window')).toBe(true)
		expect(res.agent.pane).toEqual({ mux: 'tmux', id: '%9' })
		expect(fake.starts()).toEqual([])
	})

	it('a claude spawn inside a detected backend a unit record cannot carry is refused, not sent to a background session', async () => {
		const fake = backends()
		await expect(spawnWith({ CYBER_MUX: 'wezterm', WEZTERM_PANE: '3' }, fake.exec, 'claude')).rejects.toThrow(
			/detected wezterm/,
		)
		expect(fake.starts()).toEqual([])
	})
})
