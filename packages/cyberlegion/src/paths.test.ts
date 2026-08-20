import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Exec } from './identity.ts'
import {
	assertSafeId,
	ensureMarker,
	InvalidIdError,
	paths,
	resolveProjectLocalRoot,
	resolveRoot,
	resolveUnitWorktreePath,
	sanitizePane,
} from './paths.ts'

describe('resolveRoot', () => {
	it('prefers explicit --root/--space over the env', () => {
		expect(resolveRoot({ root: '/tmp/a', env: { CYBERLEGION_ROOT: '/tmp/b' } })).toBe('/tmp/a')
		expect(resolveRoot({ space: '/tmp/c', env: {} })).toBe('/tmp/c')
	})

	it('falls back to CYBERLEGION_ROOT, then the global hub under the home directory', () => {
		expect(resolveRoot({ env: { CYBERLEGION_ROOT: '/tmp/b' } })).toBe('/tmp/b')
		expect(resolveRoot({ cwd: '/tmp', env: {} })).toBe(join(homedir(), '.agents', 'cyberlegion'))
	})
})

describe('resolveProjectLocalRoot', () => {
	it('pins the tracked marker at the primary checkout via --git-common-dir', () => {
		const exec: Exec = () => '/primary/.git'
		expect(resolveProjectLocalRoot({ cwd: '/primary/.agents/cyberlegion/worktrees/unit-1', env: {}, exec })).toBe(
			'/primary/.agents/cyberlegion',
		)
	})

	it('falls back to the project-scoped root when not inside a git repository', () => {
		const exec: Exec = () => null
		expect(resolveProjectLocalRoot({ cwd: '/tmp/not-a-repo', env: {}, exec })).toBe(
			'/tmp/not-a-repo/.agents/cyberlegion',
		)
	})
})

describe('resolveUnitWorktreePath', () => {
	it('places the worktree as a sibling of the primary checkout, never nested inside it', () => {
		const path = resolveUnitWorktreePath('/home/user/code/cyberplace', 'unit-1')
		expect(path).toBe('/home/user/code/cyberplace.worktrees/legion-unit-1')
		expect(path.startsWith('/home/user/code/cyberplace/')).toBe(false)
	})

	it('is deterministic and distinct per id', () => {
		const a = resolveUnitWorktreePath('/repo', 'unit-a')
		const b = resolveUnitWorktreePath('/repo', 'unit-b')
		expect(a).not.toBe(b)
		expect(resolveUnitWorktreePath('/repo', 'unit-a')).toBe(a)
	})

	it('never collides across two different primary checkouts sharing a basename', () => {
		const a = resolveUnitWorktreePath('/home/alice/code/cyberplace', 'unit-1')
		const b = resolveUnitWorktreePath('/home/bob/code/cyberplace', 'unit-1')
		expect(a).not.toBe(b)
	})

	it('never resolves onto the primary checkout itself', () => {
		const primaryRoot = '/repo'
		expect(resolveUnitWorktreePath(primaryRoot, 'unit-1')).not.toBe(primaryRoot)
	})
})

describe('ensureMarker', () => {
	it('creates the hub dir and a fresh config.json marker when absent', () => {
		const dir = mkdtempSync(join(tmpdir(), 'cl-'))
		const root = join(dir, 'hub')
		ensureMarker(root)
		expect(existsSync(join(root, 'config.json'))).toBe(true)
	})

	it('is idempotent — never overwrites an existing marker', () => {
		const dir = mkdtempSync(join(tmpdir(), 'cl-'))
		const root = join(dir, 'hub')
		mkdirSync(root, { recursive: true })
		writeFileSync(join(root, 'config.json'), 'kept\n')
		ensureMarker(root)
		expect(readFileSync(join(root, 'config.json'), 'utf8')).toBe('kept\n')
	})
})

describe('sanitizePane', () => {
	it('makes a tmux pane id filesystem-safe', () => {
		expect(sanitizePane('%3')).toBe('_3')
		expect(sanitizePane('pane-1_2')).toBe('pane-1_2')
	})
})

describe('assertSafeId', () => {
	it('passes through an ordinary id unchanged', () => {
		expect(assertSafeId('a1b2c3', 'agent id')).toBe('a1b2c3')
	})

	it.each([
		['a traversal segment', '../etc/passwd'],
		['a nested traversal segment', 'foo/../../bar'],
		['an absolute path', '/etc/passwd'],
		['an embedded POSIX separator', 'a/b'],
		['an embedded Windows separator', 'a\\b'],
		['a bare "."', '.'],
		['a bare ".."', '..'],
		['the empty string', ''],
		['an embedded NUL byte', 'a\0b'],
	])('rejects %s (%j) rather than silently encoding it', (_label, bad) => {
		expect(() => assertSafeId(bad, 'agent id')).toThrow(InvalidIdError)
	})

	it('names the offending value and kind in the thrown error', () => {
		try {
			assertSafeId('../x', 'agent id')
			expect.unreachable()
		} catch (err) {
			expect(err).toBeInstanceOf(InvalidIdError)
			expect((err as InvalidIdError).kind).toBe('agent id')
			expect((err as InvalidIdError).value).toBe('../x')
		}
	})
})

describe('paths.* path builders reject an unsafe id before it ever reaches join()', () => {
	it('agentFile/inboxDir/dataDir/briefFile all reject a traversal id', () => {
		const root = '/hub'
		expect(() => paths.agentFile(root, '../x')).toThrow(InvalidIdError)
		expect(() => paths.inboxDir(root, '../x')).toThrow(InvalidIdError)
		expect(() => paths.inboxReadDir(root, '../x')).toThrow(InvalidIdError)
		expect(() => paths.dataDir(root, '../x')).toThrow(InvalidIdError)
		expect(() => paths.briefFile(root, '../x')).toThrow(InvalidIdError)
	})

	it('messageFile/messageReadFile reject a traversal message id even when toId is safe', () => {
		const root = '/hub'
		expect(() => paths.messageFile(root, 'bob', '../x')).toThrow(InvalidIdError)
		expect(() => paths.messageReadFile(root, 'bob', '../x')).toThrow(InvalidIdError)
	})

	it('a safe id resolves strictly under the intended subtree', () => {
		const root = '/hub'
		expect(paths.agentFile(root, 'bob')).toBe(join(root, 'agents', 'bob.json'))
		expect(paths.messageFile(root, 'bob', 'm1')).toBe(join(root, 'inbox', 'bob', 'm1.json'))
	})
})
