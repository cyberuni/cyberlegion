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
