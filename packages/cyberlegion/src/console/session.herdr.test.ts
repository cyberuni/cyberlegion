import { describe, expect, it } from 'vitest'
import type { Exec } from '../identity.ts'
import { herdrSessionAdapter } from './session.herdr.ts'

function fakeExec(calls: string[][], responses: Record<string, string | null> = {}): Exec {
	return (_cmd, args) => {
		calls.push(args)
		const key = args.slice(0, 2).join(' ')
		return responses[key] ?? null
	}
}

describe('herdrSessionAdapter (mocked exec — herdr is not installed in this environment)', () => {
	it('open() splits a pane at the given cwd, extracts the pane id from herdr JSON, and runs the launch command', () => {
		const calls: string[][] = []
		const splitOut = JSON.stringify({
			id: 'cli:pane:split',
			result: { pane: { pane_id: 'w3:pB', tab_id: 'w3:t1', workspace_id: 'w3' }, type: 'pane_info' },
		})
		const exec = fakeExec(calls, { 'pane split': splitOut })
		const target = herdrSessionAdapter.open(exec, { cwd: '/unit', launch: 'claude' })
		expect(target).toEqual({ id: 'w3:pB' })
		expect(calls[0]).toEqual(['pane', 'split', '--current', '--direction', 'right', '--cwd', '/unit'])
		expect(calls[1]).toEqual(['pane', 'run', 'w3:pB', 'claude'])
	})

	it("open() at 'workspace' creates a separate workspace instead of splitting the current one", () => {
		const calls: string[][] = []
		const createOut = JSON.stringify({
			id: 'cli:workspace:create',
			result: { root_pane: { pane_id: 'w7:p1' }, workspace: { workspace_id: 'w7' } },
		})
		const exec = fakeExec(calls, { 'workspace create': createOut })
		const target = herdrSessionAdapter.open(exec, { cwd: '/unit', launch: 'claude', at: 'workspace' })
		expect(target).toEqual({ id: 'w7:p1' })
		expect(calls[0]).toEqual(['workspace', 'create', '--cwd', '/unit', '--no-focus'])
		expect(calls[1]).toEqual(['pane', 'run', 'w7:p1', 'claude'])
	})

	it('open() throws when workspace create reports no root pane id', () => {
		const exec = fakeExec([], { 'workspace create': JSON.stringify({ id: 'cli:workspace:create', result: {} }) })
		expect(() => herdrSessionAdapter.open(exec, { cwd: '/unit', launch: 'claude', at: 'workspace' })).toThrow(
			/root_pane/,
		)
	})

	it('openInNewWorktree() creates the worktree and opens it in one call, extracting pane + worktree', () => {
		const calls: string[][] = []
		const createOut = JSON.stringify({
			id: 'cli:worktree:create',
			result: {
				root_pane: { pane_id: 'w9:p1' },
				workspace: { workspace_id: 'w9' },
				worktree: { branch: 'cyberlegion/unit-abc123', path: '/repo.worktrees/legion-abc123' },
			},
		})
		const exec = fakeExec(calls, { 'worktree create': createOut })
		const result = herdrSessionAdapter.openInNewWorktree!(exec, {
			primaryRoot: '/repo',
			branch: 'cyberlegion/unit-abc123',
			path: '/repo.worktrees/legion-abc123',
			launch: 'claude',
		})
		expect(result.target).toEqual({ id: 'w9:p1' })
		expect(result.worktree).toEqual({ root: '/repo.worktrees/legion-abc123', branch: 'cyberlegion/unit-abc123' })
		expect(calls[0]).toEqual([
			'worktree',
			'create',
			'--cwd',
			'/repo',
			'--branch',
			'cyberlegion/unit-abc123',
			'--path',
			'/repo.worktrees/legion-abc123',
			'--no-focus',
		])
		expect(calls[1]).toEqual(['pane', 'run', 'w9:p1', 'claude'])
	})

	it('openInNewWorktree() throws when herdr reports no root pane id', () => {
		const exec = fakeExec([], { 'worktree create': JSON.stringify({ id: 'cli:worktree:create', result: {} }) })
		expect(() =>
			herdrSessionAdapter.openInNewWorktree!(exec, {
				primaryRoot: '/repo',
				branch: 'b',
				path: '/p',
				launch: 'claude',
			}),
		).toThrow(/root_pane/)
	})

	it('openInNewWorktree() throws when herdr reports no worktree path/branch', () => {
		const out = JSON.stringify({ id: 'cli:worktree:create', result: { root_pane: { pane_id: 'w9:p1' } } })
		const exec = fakeExec([], { 'worktree create': out })
		expect(() =>
			herdrSessionAdapter.openInNewWorktree!(exec, {
				primaryRoot: '/repo',
				branch: 'b',
				path: '/p',
				launch: 'claude',
			}),
		).toThrow(/worktree/)
	})

	it('openInNewWorktree() throws when herdr reports nothing', () => {
		const exec: Exec = () => null
		expect(() =>
			herdrSessionAdapter.openInNewWorktree!(exec, {
				primaryRoot: '/repo',
				branch: 'b',
				path: '/p',
				launch: 'claude',
			}),
		).toThrow(/herdr worktree create/)
	})

	it('open() throws when herdr reports no pane id', () => {
		const exec: Exec = () => null
		expect(() => herdrSessionAdapter.open(exec, { cwd: '/unit', launch: 'claude' })).toThrow(/herdr pane split/)
	})

	it('open() throws when herdr output lacks result.pane.pane_id', () => {
		const exec = fakeExec([], { 'pane split': JSON.stringify({ id: 'cli:pane:split', result: {} }) })
		expect(() => herdrSessionAdapter.open(exec, { cwd: '/unit', launch: 'claude' })).toThrow(/pane_id/)
	})

	it('send() runs text in the target pane', () => {
		const calls: string[][] = []
		const exec = fakeExec(calls)
		herdrSessionAdapter.send(exec, { id: 'p-1' }, 'hello')
		expect(calls[0]).toEqual(['pane', 'run', 'p-1', 'hello'])
	})

	it('read() captures visible pane output, optionally scoped to N lines', () => {
		const calls: string[][] = []
		const exec = fakeExec(calls, { 'pane read': 'line1\nline2' })
		expect(herdrSessionAdapter.read(exec, { id: 'p-1' })).toBe('line1\nline2')
		expect(calls[0]).toEqual(['pane', 'read', 'p-1', '--source', 'visible'])

		herdrSessionAdapter.read(exec, { id: 'p-1' }, { lines: 50 })
		expect(calls[1]).toEqual(['pane', 'read', 'p-1', '--source', 'visible', '--lines', '50'])
	})

	it('focus() focuses the target pane', () => {
		const calls: string[][] = []
		const exec = fakeExec(calls)
		herdrSessionAdapter.focus(exec, { id: 'p-1' })
		expect(calls[0]).toEqual(['pane', 'focus', 'p-1'])
	})

	it('teardown() closes the pane', () => {
		const calls: string[][] = []
		const exec = fakeExec(calls)
		herdrSessionAdapter.teardown(exec, { id: 'p-1' })
		expect(calls[0]).toEqual(['pane', 'close', 'p-1'])
	})
})
