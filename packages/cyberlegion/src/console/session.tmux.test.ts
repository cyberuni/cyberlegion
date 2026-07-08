import { describe, expect, it } from 'vitest'
import type { Exec } from '../identity.ts'
import { tmuxSessionAdapter } from './session.tmux.ts'

function fakeExec(calls: string[][], responses: Record<string, string | null> = {}): Exec {
	return (_cmd, args) => {
		calls.push(args)
		return responses[args[0]!] ?? null
	}
}

describe('tmuxSessionAdapter', () => {
	it('open() splits a pane at the given cwd and launches the command in it', () => {
		const calls: string[][] = []
		const exec = fakeExec(calls, { 'split-window': '%9' })
		const target = tmuxSessionAdapter.open(exec, { cwd: '/unit', launch: 'claude' })
		expect(target).toEqual({ id: '%9' })
		expect(calls[0]).toEqual(['split-window', '-h', '-c', '/unit', '-P', '-F', '#{pane_id}'])
		expect(calls[1]).toEqual(['send-keys', '-t', '%9', 'claude', 'Enter'])
	})

	it('open() defaults to pane:right and honors pane:down / window / tab placement', () => {
		const calls: string[][] = []
		const exec = fakeExec(calls, { 'split-window': '%1', 'new-window': '%2' })
		tmuxSessionAdapter.open(exec, { cwd: '/u', launch: 'x', at: 'pane:down' })
		expect(calls[0]).toEqual(['split-window', '-v', '-c', '/u', '-P', '-F', '#{pane_id}'])
		tmuxSessionAdapter.open(exec, { cwd: '/u', launch: 'x', at: 'window' })
		expect(calls[2]).toEqual(['new-window', '-c', '/u', '-P', '-F', '#{pane_id}'])
		tmuxSessionAdapter.open(exec, { cwd: '/u', launch: 'x', at: 'tab' })
		expect(calls[4]).toEqual(['new-window', '-c', '/u', '-P', '-F', '#{pane_id}'])
	})

	it("open() at 'workspace' opens a new detached session instead of a pane in the current one", () => {
		const calls: string[][] = []
		const exec = fakeExec(calls, { 'new-session': '%20' })
		const target = tmuxSessionAdapter.open(exec, { cwd: '/unit', launch: 'claude', at: 'workspace' })
		expect(target).toEqual({ id: '%20' })
		expect(calls[0]).toEqual(['new-session', '-d', '-c', '/unit', '-P', '-F', '#{pane_id}'])
		expect(calls[1]).toEqual(['send-keys', '-t', '%20', 'claude', 'Enter'])
	})

	it('open() throws when tmux reports no pane', () => {
		const exec: Exec = () => null
		expect(() => tmuxSessionAdapter.open(exec, { cwd: '/unit', launch: 'claude' })).toThrow(/split-window/)
	})

	it('send() types text into the target pane', () => {
		const calls: string[][] = []
		const exec = fakeExec(calls)
		tmuxSessionAdapter.send(exec, { id: '%3' }, 'hello')
		expect(calls[0]).toEqual(['send-keys', '-t', '%3', 'hello', 'Enter'])
	})

	it('read() captures pane output, optionally scoped to N lines', () => {
		const calls: string[][] = []
		const exec = fakeExec(calls, { 'capture-pane': 'line1\nline2' })
		expect(tmuxSessionAdapter.read(exec, { id: '%3' })).toBe('line1\nline2')
		expect(calls[0]).toEqual(['capture-pane', '-p', '-t', '%3'])

		tmuxSessionAdapter.read(exec, { id: '%3' }, { lines: 50 })
		expect(calls[1]).toEqual(['capture-pane', '-p', '-t', '%3', '-S', '-50'])
	})

	it('focus() selects the target pane', () => {
		const calls: string[][] = []
		const exec = fakeExec(calls)
		tmuxSessionAdapter.focus(exec, { id: '%3' })
		expect(calls[0]).toEqual(['select-pane', '-t', '%3'])
	})

	it('teardown() kills the pane', () => {
		const calls: string[][] = []
		const exec = fakeExec(calls)
		tmuxSessionAdapter.teardown(exec, { id: '%3' })
		expect(calls[0]).toEqual(['kill-pane', '-t', '%3'])
	})

	it('paneExists() is true when list-panes includes the id, false when it is gone', () => {
		// has-session misses (not a session name); list-panes lists the pane → exists
		expect(tmuxSessionAdapter.paneExists(fakeExec([], { 'list-panes': '%1\n%3\n%7' }), { id: '%3' })).toBe(true)
		// list-panes omits it → gone
		expect(tmuxSessionAdapter.paneExists(fakeExec([], { 'list-panes': '%1\n%7' }), { id: '%3' })).toBe(false)
	})
})
