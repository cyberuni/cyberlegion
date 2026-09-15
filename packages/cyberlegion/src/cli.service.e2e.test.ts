import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it } from 'vitest'

// `service` driven through the built CLI entrypoint. Ownership is the contended resource here, so
// the resolve-or-start race runs as genuinely concurrent OS processes against one --space hub.
const BIN = fileURLToPath(new URL('../bin/cyberlegion.mjs', import.meta.url))

const MUX_ENV_KEYS = [
	'TMUX',
	'TMUX_PANE',
	'HERDR_ENV',
	'HERDR_PANE_ID',
	'CYBER_MUX',
	'CYBER_MUX_PANE',
	'CYBERLEGION_MUX',
	'CYBERLEGION_MUX_PANE',
	'CYBERLEGION_AGENT_ID',
]
function baseEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
	const merged = { ...process.env, ...env }
	for (const k of MUX_ENV_KEYS) if (!(k in env)) delete merged[k]
	return merged
}

let base: string
let space: string
let project: string
beforeEach(() => {
	base = mkdtempSync(join(tmpdir(), 'cl-svc-e2e-'))
	space = join(base, 'hub')
	const dir = join(base, 'alpha')
	mkdirSync(dir)
	execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir })
	project = JSON.parse(legion(['project', 'register', '--dir', dir, '--format', 'json'])).id
})

function legion(args: string[], env: NodeJS.ProcessEnv = {}, cwd?: string): string {
	return execFileSync('node', [BIN, ...args, '--space', space], { encoding: 'utf8', env: baseEnv(env), cwd })
}

function legionJson(args: string[], env: NodeJS.ProcessEnv = {}) {
	return JSON.parse(legion([...args, '--format', 'json'], env))
}

function run(args: string[], env: NodeJS.ProcessEnv = {}) {
	return spawnSync('node', [BIN, ...args, '--space', space], { encoding: 'utf8', env: baseEnv(env) })
}

/** Register a pane-less unit under a fixed id, and return the env that makes a CLI call act as it. */
function asUnit(id: string): NodeJS.ProcessEnv {
	const env = { CYBERLEGION_AGENT_ID: id }
	legion(['unit', 'register', '--harness', 'claude', '--handle', id], env)
	return env
}

function start(args: string[]): Promise<{ stdout: string; stderr: string; status: number | null }> {
	return new Promise((resolve) => {
		const child = spawn('node', [BIN, ...args, '--space', space], { env: baseEnv({}) })
		let stdout = ''
		let stderr = ''
		child.stdout.on('data', (d) => {
			stdout += d
		})
		child.stderr.on('data', (d) => {
			stderr += d
		})
		child.on('close', (status) => resolve({ stdout, stderr, status }))
	})
}

describe('spec:cyberlegion/service — CLI', () => {
	it('concurrent `service acquire` from real processes: exactly one reservation, everyone else sees starting', async () => {
		const N = 8
		const results = await Promise.all(
			Array.from({ length: N }, () => start(['service', 'acquire', project, 'controller', '--format', 'json'])),
		)
		for (const r of results) expect(r.status).toBe(0)
		const outcomes = results.map((r) => JSON.parse(r.stdout))
		expect(outcomes.filter((o) => o.outcome === 'reserved')).toHaveLength(1)
		expect(outcomes.filter((o) => o.outcome === 'starting')).toHaveLength(N - 1)
		expect(new Set(outcomes.map((o) => o.generation))).toEqual(new Set([1]))
	})

	it('acquire → bind → verify → handoff, with the old owner rejected by verify', () => {
		const u1 = asUnit('unit-one')
		const u2 = asUnit('unit-two')
		const reserved = legionJson(['service', 'acquire', project, 'controller'])
		expect(reserved.outcome).toBe('reserved')

		const bound = legionJson(
			[
				'service',
				'bind',
				project,
				'controller',
				'--generation',
				String(reserved.generation),
				'--token',
				reserved.token,
			],
			u1,
		)
		expect(bound).toMatchObject({ state: 'active', holder: 'unit-one', health: 'healthy', control: 'none' })

		expect(run(['service', 'verify', project, 'controller', '--generation', '1'], u1).status).toBe(0)
		legion(['service', 'handoff', project, 'controller', '--generation', '1', '--to', 'unit-two'], u1)

		const stale = run(['service', 'verify', project, 'controller', '--generation', '1'], u1)
		expect(stale.status).not.toBe(0)
		expect(stale.stderr).toContain('not the owner')
		expect(run(['service', 'verify', project, 'controller', '--generation', '2'], u2).status).toBe(0)
	})

	it('service resolve reports that a pane-less owner resolves without recoverable control', () => {
		const u1 = asUnit('sub')
		const reserved = legionJson(['service', 'acquire', project, 'controller'])
		legion(['service', 'bind', project, 'controller', '--generation', '1', '--token', reserved.token], u1)

		const shown = legion(['service', 'resolve', project, 'controller'])
		expect(shown).toContain('control: none')
		expect(shown).toContain('not recoverable')
	})

	it("mail sent to the service endpoint stays pending across an owner's replacement", () => {
		const u1 = asUnit('first')
		asUnit('sender')
		const reserved = legionJson(['service', 'acquire', project, 'controller'])
		legion(['service', 'bind', project, 'controller', '--generation', '1', '--token', reserved.token], u1)
		const endpoint = legionJson(['service', 'resolve', project, 'controller']).endpoint

		legion(['mail', 'send', '--from', 'sender', '--to', endpoint, '--body', 'pending work', '--no-nudge'])
		legion(['service', 'release', project, 'controller', '--generation', '1'], u1)
		const u2 = asUnit('second')
		const again = legionJson(['service', 'acquire', project, 'controller'])
		legion(['service', 'bind', project, 'controller', '--generation', '2', '--token', again.token], u2)

		expect(legionJson(['service', 'resolve', project, 'controller']).endpoint).toBe(endpoint)
		const pending = legionJson(['mail', 'inbox', '--owner', endpoint, '--unread'])
		expect(pending.map((m: { body: string }) => m.body)).toEqual(['pending work'])
	})

	it('a stale bind fails loud and leaves the current reservation in place', () => {
		const u1 = asUnit('late')
		legionJson(['service', 'acquire', project, 'controller'])
		const res = run(['service', 'bind', project, 'controller', '--generation', '1', '--token', 'wrong'], u1)
		expect(res.status).not.toBe(0)
		expect(res.stderr).toContain('no longer current')
		expect(legionJson(['service', 'resolve', project, 'controller']).health).toBe('starting')
	})

	it('with no project argument, a service resolves the project of the current directory and registers it', () => {
		const dir = join(base, 'beta')
		const linked = join(base, 'beta.worktrees', 'w1')
		mkdirSync(dir)
		execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir })
		execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'i'], {
			cwd: dir,
		})
		execFileSync('git', ['worktree', 'add', '-q', '-b', 'w1', linked], { cwd: dir })

		const acquired = JSON.parse(legion(['service', 'acquire', 'controller', '--format', 'json'], {}, linked))
		expect(acquired.outcome).toBe('reserved')

		const shown = JSON.parse(legion(['project', 'show', 'beta', '--format', 'json']))
		expect(acquired.project).toBe(shown.id)
		expect(JSON.parse(legion(['service', 'resolve', 'controller', '--format', 'json'], {}, dir)).health).toBe(
			'starting',
		)
	})
})
