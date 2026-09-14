import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { listProjects, registerProject, resolveProject } from './project.ts'
import { FileStore } from './store/file-store.ts'

let base: string
let store: FileStore
beforeEach(() => {
	base = mkdtempSync(join(tmpdir(), 'cl-prj-'))
	store = new FileStore(join(base, 'hub'))
})

function git(cwd: string, ...args: string[]): void {
	execFileSync('git', args, { cwd, stdio: 'ignore' })
}

/** A real git repository with one commit, so `git worktree add` has something to check out. */
function repo(path: string): string {
	mkdirSync(path, { recursive: true })
	git(path, 'init', '-q', '-b', 'main')
	git(path, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'init')
	return path
}

describe('spec:cyberlegion/project — a stable project reference', () => {
	it('the default checkout and its linked worktree register as one project', () => {
		const primary = repo(join(base, 'alpha'))
		const linked = join(base, 'alpha.worktrees', 'w1')
		git(primary, 'worktree', 'add', '-q', '-b', 'w1', linked)

		const fromPrimary = registerProject({ store }, { dir: primary })
		const fromLinked = registerProject({ store }, { dir: linked })

		expect(fromLinked.id).toBe(fromPrimary.id)
		expect(fromPrimary.name).toBe('alpha')
		expect(listProjects(store)).toHaveLength(1)
	})

	it('unrelated projects sharing a directory name stay distinct', () => {
		const a = registerProject({ store }, { dir: repo(join(base, 'one', 'app')) })
		const b = registerProject({ store }, { dir: repo(join(base, 'two', 'app')) })

		expect(a.name).toBe('app')
		expect(b.name).toBe('app')
		expect(a.id).not.toBe(b.id)
		expect(listProjects(store)).toHaveLength(2)
	})

	it('a registered project resolves by id, by unique name, and by any path inside it', () => {
		const primary = repo(join(base, 'alpha'))
		const linked = join(base, 'alpha.worktrees', 'w1')
		git(primary, 'worktree', 'add', '-q', '-b', 'w1', linked)
		const rec = registerProject({ store }, { dir: primary })

		expect(resolveProject({ store }, rec.id).id).toBe(rec.id)
		expect(resolveProject({ store }, 'alpha').id).toBe(rec.id)
		expect(resolveProject({ store }, linked).id).toBe(rec.id)
	})

	it('an ambiguous name fails loud, naming the candidate ids', () => {
		const a = registerProject({ store }, { dir: repo(join(base, 'one', 'app')) })
		const b = registerProject({ store }, { dir: repo(join(base, 'two', 'app')) })

		expect(() => resolveProject({ store }, 'app')).toThrow(new RegExp(`${a.id}.*${b.id}|${b.id}.*${a.id}`))
	})

	it('an unregistered checkout does not resolve — resolution never registers', () => {
		const dir = repo(join(base, 'loose'))
		expect(() => resolveProject({ store }, dir)).toThrow(/not registered/)
		expect(listProjects(store)).toHaveLength(0)
	})

	it('registering outside any git repository fails loud', () => {
		const dir = join(base, 'plain')
		mkdirSync(dir)
		expect(() => registerProject({ store }, { dir })).toThrow(/not inside a git repository/)
	})
})
