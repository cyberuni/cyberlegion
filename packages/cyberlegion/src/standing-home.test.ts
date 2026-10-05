import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import {
	claimPresence,
	type IdContext,
	loadAgent,
	realExec,
	register,
	registerStanding,
	standingId,
} from './identity.ts'
import { resolveHomeFlags } from './standing-home.ts'
import { FileStore } from './store/file-store.ts'

// spec: unit/registry/registry.feature — "A standing owner's home (where its presence is spawned on
// demand)". The CLI validates the flags (`resolveHomeFlags`) before `registerStanding` writes, so a
// refusal leaves the registry exactly as it was; these tests drive that same pair.

let store: FileStore
let root: string
beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), 'cl-home-'))
	store = new FileStore(join(root, 'hub'))
})

function ctx(): IdContext {
	return { store, env: {}, exec: realExec, now: () => 1_700_000_000_000 }
}

/** An existing folder outside any git repository. */
function folder(name: string): string {
	const dir = join(root, name)
	mkdirSync(dir, { recursive: true })
	return dir
}

/** A folder that resolves the agent definition `name` (`.agents/agents/<name>.md`). */
function folderWithAgent(name: string, agent: string): string {
	const dir = folder(name)
	mkdirSync(join(dir, '.agents', 'agents'), { recursive: true })
	writeFileSync(join(dir, '.agents', 'agents', `${agent}.md`), '---\nharness: codex\n---\nsort the incoming mail\n')
	return dir
}

/** What `unit register --standing --handle <handle>` with these flags does: validate, then write. */
function registerHome(handle: string, flags: Parameters<typeof resolveHomeFlags>[1]) {
	const home = resolveHomeFlags(realExec, { standing: true, handle, ...flags })
	return registerStanding(ctx(), { handle, home })
}

const keeper = () => loadAgent(store, standingId('keeper'))

describe("spec:cyberlegion/unit/registry — a standing owner's home", () => {
	it("unit register --standing --home --agent records the owner's home and its agent definition", () => {
		const desk = folderWithAgent('keeper-desk', 'triage')
		const rec = registerHome('keeper', { home: desk, agent: 'triage' })
		expect(rec.home).toEqual({ dir: desk, agent: 'triage' })
		expect(rec.cwd).toBe(process.cwd())
		expect(rec.cwd).not.toBe(desk)
	})

	it("unit register --standing --home --harness records the owner's home and its harness", () => {
		const desk = folder('keeper-desk')
		expect(registerHome('keeper', { home: desk, harness: 'codex' }).home).toEqual({ dir: desk, harness: 'codex' })
	})

	it('re-registering a standing owner from another folder keeps its home and its presence', () => {
		const desk = folder('keeper-desk')
		registerHome('keeper', { home: desk, harness: 'codex' })
		const unit = register(
			{ store, env: { TMUX: 't', TMUX_PANE: '%3' }, exec: () => 'x' },
			{ handle: 'u', harness: 'claude' },
		)
		claimPresence({ store, env: { TMUX: 't', TMUX_PANE: '%3' }, exec: () => 'x' }, 'keeper')
		registerHome('keeper', {})
		expect(keeper()?.home).toEqual({ dir: desk, harness: 'codex' })
		expect(keeper()?.presence).toBe(unit.id)
	})

	it("unit register --standing --clear-home drops the owner's home", () => {
		registerHome('keeper', { home: folder('keeper-desk'), harness: 'codex' })
		registerHome('keeper', { clearHome: true })
		expect(keeper()?.home).toBeUndefined()
	})

	it('--clear-home on a standing owner with no home is a no-op', () => {
		registerHome('keeper', {})
		expect(() => registerHome('keeper', { clearHome: true })).not.toThrow()
		expect(keeper()?.home).toBeUndefined()
	})

	it('a home folder that does not exist is refused and nothing is written', () => {
		expect(() => registerHome('keeper', { home: join(root, 'missing'), harness: 'codex' })).toThrow(
			/must already exist/,
		)
		expect(keeper()).toBeUndefined()
	})

	it('a home with no launch is refused', () => {
		const desk = folder('keeper-desk')
		registerHome('keeper', { home: desk, harness: 'codex' })
		expect(() => registerHome('keeper', { home: folder('other-desk') })).toThrow(/exactly one of --agent or --harness/)
		expect(keeper()?.home).toEqual({ dir: desk, harness: 'codex' })
	})

	it('a home naming both an agent definition and a harness is refused', () => {
		const desk = folder('keeper-desk')
		registerHome('keeper', { home: desk, harness: 'codex' })
		const other = folderWithAgent('other-desk', 'triage')
		expect(() => registerHome('keeper', { home: other, agent: 'triage', harness: 'claude' })).toThrow(
			/exactly one of --agent or --harness/,
		)
		expect(keeper()?.home).toEqual({ dir: desk, harness: 'codex' })
	})

	it('a home with an unrecognized harness is refused', () => {
		expect(() => registerHome('keeper', { home: folder('keeper-desk'), harness: 'grok' })).toThrow(
			/claude \| cursor \| codex/,
		)
		expect(keeper()).toBeUndefined()
	})

	it('a home whose agent definition does not resolve from the folder is refused', () => {
		expect(() => registerHome('keeper', { home: folder('keeper-desk'), agent: 'triage' })).toThrow(
			/"triage" does not resolve from the home/,
		)
		expect(keeper()).toBeUndefined()
	})

	it('a home on the primary checkout of its repository is refused', () => {
		const repo = folder('repo')
		execFileSync('git', ['init', '-q', repo])
		expect(() => registerHome('keeper', { home: repo, harness: 'codex' })).toThrow(/refuses the primary checkout/)
		expect(keeper()).toBeUndefined()
	})

	it('a launch with no home is refused', () => {
		registerHome('keeper', {})
		expect(() => registerHome('keeper', { harness: 'codex' })).toThrow(/a launch needs --home/)
		expect(keeper()?.home).toBeUndefined()
	})

	it('--home together with --clear-home is refused', () => {
		const desk = folder('keeper-desk')
		registerHome('keeper', { home: desk, harness: 'codex' })
		expect(() => registerHome('keeper', { home: folder('other-desk'), harness: 'codex', clearHome: true })).toThrow(
			/contradict/,
		)
		expect(keeper()?.home).toEqual({ dir: desk, harness: 'codex' })
	})

	it('a home flag on a session registration is refused', () => {
		expect(() => resolveHomeFlags(realExec, { home: folder('keeper-desk'), harness: 'codex' })).toThrow(
			/a home belongs only to a named standing owner/,
		)
	})

	it('a home flag on the bare standing listing is refused', () => {
		expect(() => resolveHomeFlags(realExec, { standing: true, home: folder('keeper-desk'), harness: 'codex' })).toThrow(
			/a home belongs only to a named standing owner/,
		)
	})
})
