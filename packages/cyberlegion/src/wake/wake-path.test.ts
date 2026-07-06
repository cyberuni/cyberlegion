import { describe, expect, it } from 'vitest'
import type { MuxProbe } from '../console/mux-probe.ts'
import { selectWakePath } from './wake-path.ts'

const noMux: MuxProbe = { mux: 'none', via: 'ancestry' }
const tmux: MuxProbe = { mux: 'tmux', pane: '%1', via: 'ancestry' }

describe('selectWakePath', () => {
	it('portable default is A-loop', () => {
		expect(selectWakePath({ harness: 'codex', mux: tmux }).path).toBe('A-loop')
	})

	it('Claude Code + observable prefers A-prime', () => {
		expect(selectWakePath({ harness: 'claude', mux: tmux, observable: true }).path).toBe('A-prime')
	})

	it('a live foreign session + mux prefers B', () => {
		expect(selectWakePath({ harness: 'cursor', mux: tmux, dedicatedListener: true }).path).toBe('B')
	})

	it('never returns B when mux is none, even with a dedicated listener', () => {
		const result = selectWakePath({ harness: 'cursor', mux: noMux, dedicatedListener: true })
		expect(result.path).not.toBe('B')
		expect(result.path).toBe('A-loop')
	})

	it('never returns B when mux is none, even for claude + observable + dedicatedListener', () => {
		const result = selectWakePath({ harness: 'claude', mux: noMux, observable: true, dedicatedListener: true })
		expect(result.path).not.toBe('B')
	})

	it('claude + observable takes priority over a dedicated listener', () => {
		expect(selectWakePath({ harness: 'claude', mux: tmux, observable: true, dedicatedListener: true }).path).toBe(
			'A-prime',
		)
	})

	it('every result carries a non-empty rationale', () => {
		for (const input of [
			{ harness: 'codex', mux: tmux },
			{ harness: 'claude', mux: tmux, observable: true },
			{ harness: 'cursor', mux: tmux, dedicatedListener: true },
			{ harness: 'cursor', mux: noMux },
		]) {
			expect(selectWakePath(input).why.length).toBeGreaterThan(0)
		}
	})
})
