import { describe, expect, it } from 'vitest'
import { normalizeMuxEnv } from './mux-env.ts'

// spec: mux/mux.feature — "a pane carrying only the legacy fast-path vars is still honored" and
// "the current fast-path vars win over the legacy pair when both are set". This is cyberlegion's own
// transitional seam (not cyber-mux's) — cyber-mux's `currentPane`/`probeMultiplexer` cannot be
// steered onto a differently-named legacy pair, so normalizeMuxEnv is the one place this rule lives.
describe('spec:cyberlegion/mux-env', () => {
	it('copies the legacy pair onto the current names when only the legacy pair is set', () => {
		const env = normalizeMuxEnv({ CYBERLEGION_MUX: 'herdr', CYBERLEGION_MUX_PANE: 'w1:p2' })
		expect(env.CYBER_MUX).toBe('herdr')
		expect(env.CYBER_MUX_PANE).toBe('w1:p2')
	})

	it('leaves env unchanged when neither the current nor the legacy pair is set', () => {
		const env = normalizeMuxEnv({ SOME_OTHER_VAR: '1' })
		expect(env.CYBER_MUX).toBeUndefined()
		expect(env.CYBER_MUX_PANE).toBeUndefined()
		expect(env.SOME_OTHER_VAR).toBe('1')
	})

	it('the current pair wins outright when both pairs are set — never a mix', () => {
		const env = normalizeMuxEnv({
			CYBER_MUX: 'tmux',
			CYBER_MUX_PANE: '%3',
			CYBERLEGION_MUX: 'herdr',
			CYBERLEGION_MUX_PANE: 'w1:p2',
		})
		expect(env.CYBER_MUX).toBe('tmux')
		expect(env.CYBER_MUX_PANE).toBe('%3')
	})

	it('never overwrites a set current var even when only one half of the current pair is set', () => {
		// $CYBER_MUX=none is the override form (no pane rides with it) — a legacy pair present
		// alongside it must never leak CYBER_MUX_PANE in, which would silently un-override it.
		const env = normalizeMuxEnv({
			CYBER_MUX: 'none',
			CYBERLEGION_MUX: 'herdr',
			CYBERLEGION_MUX_PANE: 'w1:p2',
		})
		expect(env.CYBER_MUX).toBe('none')
		expect(env.CYBER_MUX_PANE).toBeUndefined()
	})

	it('is a pure function — does not mutate the input env object', () => {
		const input = { CYBERLEGION_MUX: 'tmux' }
		const env = normalizeMuxEnv(input)
		expect(input).not.toHaveProperty('CYBER_MUX')
		expect(env).not.toBe(input)
	})
})
