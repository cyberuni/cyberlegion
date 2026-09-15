import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it } from 'vitest'

// `project` driven through the built CLI entrypoint, against real git repositories and an isolated
// --space hub per test.
const BIN = fileURLToPath(new URL('../bin/cyberlegion.mjs', import.meta.url))

let base: string
let space: string
beforeEach(() => {
	base = mkdtempSync(join(tmpdir(), 'cl-prj-e2e-'))
	space = join(base, 'hub')
})

function legion(args: string[], cwd = base): string {
	return execFileSync('node', [BIN, ...args, '--space', space], { encoding: 'utf8', cwd })
}

function git(cwd: string, ...args: string[]): void {
	execFileSync('git', args, { cwd, stdio: 'ignore' })
}

function repo(path: string): string {
	mkdirSync(path, { recursive: true })
	git(path, 'init', '-q', '-b', 'main')
	git(path, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'init')
	return path
}

describe('spec:cyberlegion/project — CLI', () => {
	it('project register from a worktree and from the default checkout yields one id', () => {
		const primary = repo(join(base, 'alpha'))
		const linked = join(base, 'alpha.worktrees', 'w1')
		git(primary, 'worktree', 'add', '-q', '-b', 'w1', linked)

		const a = JSON.parse(legion(['project', 'register', '--format', 'json'], primary))
		const b = JSON.parse(legion(['project', 'register', '--dir', linked, '--format', 'json']))

		expect(b.id).toBe(a.id)
		expect(legion(['project', 'list'])).toContain('1 projects')
	})

	it('project show resolves a registered project by name from outside its directory', () => {
		const rec = JSON.parse(legion(['project', 'register', '--dir', repo(join(base, 'alpha')), '--format', 'json']))
		const shown = JSON.parse(legion(['project', 'show', 'alpha', '--format', 'json'], tmpdir()))
		expect(shown.id).toBe(rec.id)
	})

	it('project show on an unknown reference fails loud', () => {
		const res = spawnSync('node', [BIN, 'project', 'show', 'nope', '--space', space], { encoding: 'utf8' })
		expect(res.status).not.toBe(0)
		expect(res.stderr).toContain('no registered project')
	})
})
