import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync } from 'node:fs'
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

	it('a path inside an unregistered checkout registers it, from a worktree too', () => {
		const primary = repo(join(base, 'alpha'))
		const linked = join(base, 'alpha.worktrees', 'w1')
		git(primary, 'worktree', 'add', '-q', '-b', 'w1', linked)

		const rec = resolveProject({ store }, linked)

		expect(rec.name).toBe('alpha')
		expect(listProjects(store).map((p) => p.id)).toEqual([rec.id])
		expect(resolveProject({ store }, primary).id).toBe(rec.id)
	})

	it('an unregistered name does not resolve — only a path can register', () => {
		repo(join(base, 'loose'))
		expect(() => resolveProject({ store }, 'loose')).toThrow(/no registered project/)
		expect(listProjects(store)).toHaveLength(0)
	})

	it('a path outside any git repository fails loud and registers nothing', () => {
		const dir = join(base, 'plain')
		mkdirSync(dir)
		expect(() => resolveProject({ store }, dir)).toThrow(/not inside a git repository/)
		expect(listProjects(store)).toHaveLength(0)
	})

	it('the main checkout records its own root, even when the git dir lives elsewhere', () => {
		const work = join(base, 'app')
		mkdirSync(join(base, 'store'))
		execFileSync('git', ['init', '-q', '-b', 'main', '--separate-git-dir', join(base, 'store', 'app.git'), work], {
			stdio: 'ignore',
		})
		git(work, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'init')
		const linked = join(base, 'app.worktrees', 'w1')
		git(work, 'worktree', 'add', '-q', '-b', 'w1', linked)

		const fromMain = registerProject({ store }, { dir: work })
		expect(fromMain.root).toBe(realpathSync(work))
		expect(fromMain.name).toBe('app')

		// A linked worktree cannot see where a separate git dir's main checkout is, so it keeps the root
		// the main checkout recorded rather than overwriting it with a guess.
		const fromLinked = registerProject({ store }, { dir: linked })
		expect(fromLinked.id).toBe(fromMain.id)
		expect(fromLinked.root).toBe(realpathSync(work))
	})

	it('a later registration from the main checkout corrects a root guessed from a worktree', () => {
		const work = join(base, 'app')
		mkdirSync(join(base, 'store'))
		execFileSync('git', ['init', '-q', '-b', 'main', '--separate-git-dir', join(base, 'store', 'app.git'), work], {
			stdio: 'ignore',
		})
		git(work, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'init')
		const linked = join(base, 'app.worktrees', 'w1')
		git(work, 'worktree', 'add', '-q', '-b', 'w1', linked)

		registerProject({ store }, { dir: linked })
		expect(registerProject({ store }, { dir: work }).root).toBe(realpathSync(work))
	})

	it('registering outside any git repository fails loud', () => {
		const dir = join(base, 'plain')
		mkdirSync(dir)
		expect(() => registerProject({ store }, { dir })).toThrow(/not inside a git repository/)
	})
})
