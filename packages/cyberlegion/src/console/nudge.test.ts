import { describe, expect, it } from 'vitest'
import type { Exec } from '../identity.ts'
import { isStaged, nudge } from './nudge.ts'
import type { SessionAdapter, SessionTarget } from './session.ts'

const target: SessionTarget = { id: 'p-1' }
const MESSAGE = 'You have unread mail — check your inbox.'
const noopSleep = async () => {}

/** A fake adapter whose `read` returns queued values across successive calls (send/submit are spies). */
function fakeAdapter(reads: string[]): { adapter: SessionAdapter; sendCalls: string[]; submitCalls: number[] } {
	const sendCalls: string[] = []
	let submitCount = 0
	const submitCalls: number[] = []
	let readIndex = 0
	const adapter: SessionAdapter = {
		name: 'fake',
		open: () => {
			throw new Error('not used')
		},
		send: (_exec, _t, text) => {
			sendCalls.push(text)
		},
		submit: () => {
			submitCount++
			submitCalls.push(submitCount)
		},
		read: () => {
			const value = reads[Math.min(readIndex, reads.length - 1)] ?? ''
			readIndex++
			return value
		},
		focus: () => {},
		teardown: () => {},
		paneExists: () => true,
		listPanes: () => [],
	}
	return { adapter, sendCalls, submitCalls }
}

const exec: Exec = () => null

describe('isStaged', () => {
	it('is true when the message sits in the tail input box (still staged)', () => {
		const visible = ['some scrollback', 'more scrollback', `> ${MESSAGE.slice(0, 45)}`].join('\n')
		expect(isStaged(visible, MESSAGE)).toBe(true)
	})

	it('is false when the message only appears up in scrollback and the input box is empty', () => {
		const visible = [
			MESSAGE,
			'peer response line 1',
			'peer response line 2',
			'peer response line 3',
			'peer response line 4',
			'peer response line 5',
			'peer response line 6',
			'> ',
		].join('\n')
		expect(isStaged(visible, MESSAGE)).toBe(false)
	})

	it('is true (cannot confirm the turn) when visible is null or empty', () => {
		expect(isStaged(null, MESSAGE)).toBe(true)
		expect(isStaged('', MESSAGE)).toBe(true)
	})
})

const STAGED = `> ${MESSAGE.slice(0, 45)}`
const SCROLLED_OUT = [
	MESSAGE,
	'peer response line 1',
	'peer response line 2',
	'peer response line 3',
	'peer response line 4',
	'peer response line 5',
	'peer response line 6',
	'> ',
].join('\n')

describe('nudge', () => {
	it('scenario 1: first submit lands — reports success without re-submitting', async () => {
		const { adapter, sendCalls, submitCalls } = fakeAdapter([SCROLLED_OUT])
		const result = await nudge(adapter, exec, target, MESSAGE, { sleep: noopSleep })
		expect(result).toEqual({ taken: true, resubmits: 0 })
		expect(sendCalls).toEqual([MESSAGE])
		expect(submitCalls).toEqual([])
	})

	it('scenario 2: harness boot swallows the first submit — re-submits until the turn is taken', async () => {
		const { adapter, submitCalls } = fakeAdapter([STAGED, SCROLLED_OUT])
		const result = await nudge(adapter, exec, target, MESSAGE, { sleep: noopSleep })
		expect(result).toEqual({ taken: true, resubmits: 1 })
		expect(submitCalls).toEqual([1])
	})

	it('scenario 3: the re-submit path flushes via submit() and never calls send() a second time', async () => {
		const { adapter, sendCalls, submitCalls } = fakeAdapter([STAGED, STAGED, SCROLLED_OUT])
		await nudge(adapter, exec, target, MESSAGE, { sleep: noopSleep })
		expect(sendCalls).toEqual([MESSAGE])
		expect(submitCalls.length).toBeGreaterThan(0)
	})

	it('scenario 4: fails loud when the turn is never taken within the bounded retry cap', async () => {
		const { adapter, submitCalls } = fakeAdapter([STAGED])
		await expect(nudge(adapter, exec, target, MESSAGE, { attempts: 3, sleep: noopSleep })).rejects.toThrow(
			/never took the turn/,
		)
		expect(submitCalls).toEqual([1, 2, 3])
	})
})
