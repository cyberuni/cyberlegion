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
	it('open() splits a pane at the given cwd via the herdr CLI and runs the launch command', () => {
		const calls: string[][] = []
		const exec = fakeExec(calls, { 'pane split': 'p-1' })
		const target = herdrSessionAdapter.open(exec, { cwd: '/unit', launch: 'claude' })
		expect(target).toEqual({ id: 'p-1' })
		expect(calls[0]).toEqual(['pane', 'split', '--current', '--direction', 'right', '--cwd', '/unit'])
		expect(calls[1]).toEqual(['pane', 'run', 'p-1', 'claude'])
	})

	it('open() throws when herdr reports no pane id', () => {
		const exec: Exec = () => null
		expect(() => herdrSessionAdapter.open(exec, { cwd: '/unit', launch: 'claude' })).toThrow(/herdr pane split/)
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
