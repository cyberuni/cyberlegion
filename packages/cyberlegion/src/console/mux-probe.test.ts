import { describe, expect, it } from 'vitest'
import type { Exec } from '../identity.ts'
import { probeMultiplexer } from './mux-probe.ts'

/** Builds a fake `ps -o ppid=,comm= -p <pid>` chain: pid -> [ppid, comm]. */
function psChain(chain: Record<number, [number, string]>): Exec {
	return (cmd, args) => {
		if (cmd !== 'ps') return null
		const pid = Number.parseInt(args[args.length - 1] ?? '', 10)
		const entry = chain[pid]
		if (!entry) return null
		return `${entry[0]} ${entry[1]}`
	}
}

describe('probeMultiplexer — env fast-path', () => {
	it('trusts $CYBERLEGION_MUX outright, with pane', () => {
		const noExec: Exec = () => null
		expect(probeMultiplexer(noExec, { CYBERLEGION_MUX: 'tmux', CYBERLEGION_MUX_PANE: '%3' })).toEqual({
			mux: 'tmux',
			pane: '%3',
			via: 'env',
		})
	})

	it('acts as an override — CYBERLEGION_MUX=none forces no-mux even with $TMUX set', () => {
		const noExec: Exec = () => null
		expect(probeMultiplexer(noExec, { CYBERLEGION_MUX: 'none', TMUX: 't' })).toEqual({ mux: 'none', via: 'env' })
	})

	it('ignores an unrecognized $CYBERLEGION_MUX value and falls through to discovery', () => {
		const noExec: Exec = () => null
		const probe = probeMultiplexer(noExec, { CYBERLEGION_MUX: 'bogus' })
		expect(probe.mux).toBe('none')
		expect(probe.via).toBe('ancestry')
	})
})

describe('probeMultiplexer — ancestry discovery', () => {
	it('walks up the process tree to find a tmux ancestor', () => {
		const pid = process.pid
		const exec = psChain({
			[pid]: [pid + 1, 'node'],
			[pid + 1]: [pid + 2, 'bash'],
			[pid + 2]: [1, 'tmux: server'],
		})
		expect(probeMultiplexer(exec, { TMUX_PANE: '%7' })).toEqual({ mux: 'tmux', pane: '%7', via: 'ancestry' })
	})

	it('detects a herdr ancestor', () => {
		const pid = process.pid
		const exec = psChain({
			[pid]: [pid + 1, 'node'],
			[pid + 1]: [1, 'herdr'],
		})
		expect(probeMultiplexer(exec, { HERDR_PANE: 'p1' })).toEqual({ mux: 'herdr', pane: 'p1', via: 'ancestry' })
	})

	it('detects a screen ancestor', () => {
		const pid = process.pid
		const exec = psChain({ [pid]: [1, 'screen'] })
		expect(probeMultiplexer(exec, {})).toEqual({ mux: 'screen', via: 'ancestry' })
	})

	it('does not stop at the immediate parent shell — walks past it to the real mux ancestor', () => {
		const pid = process.pid
		const exec = psChain({
			[pid]: [pid + 1, 'bash'], // the tool's own shell — not the human's pane
			[pid + 1]: [pid + 2, 'bash'],
			[pid + 2]: [1, 'tmux: server'],
		})
		expect(probeMultiplexer(exec, {}).mux).toBe('tmux')
	})

	it('falls back to the $TMUX hint only when the ancestry walk is inconclusive', () => {
		const noPs: Exec = () => null // ps unavailable
		expect(probeMultiplexer(noPs, { TMUX: 't', TMUX_PANE: '%2' })).toEqual({ mux: 'tmux', pane: '%2', via: 'ancestry' })
	})

	it('reports none when neither ancestry nor an env hint finds a multiplexer', () => {
		const noPs: Exec = () => null
		expect(probeMultiplexer(noPs, {})).toEqual({ mux: 'none', via: 'ancestry' })
	})
})
