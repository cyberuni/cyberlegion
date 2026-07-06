import { describe, expect, it } from 'vitest'
import { selectSessionAdapter } from './index.ts'
import { herdrSessionAdapter } from './session.herdr.ts'
import { tmuxSessionAdapter } from './session.tmux.ts'

describe('selectSessionAdapter', () => {
	it('picks tmux when $TMUX is set', () => {
		expect(selectSessionAdapter({ TMUX: 't' })).toBe(tmuxSessionAdapter)
	})

	it('picks herdr when $HERDR_ENV is set and $TMUX is not', () => {
		expect(selectSessionAdapter({ HERDR_ENV: '1' })).toBe(herdrSessionAdapter)
	})

	it('prefers tmux when both are set', () => {
		expect(selectSessionAdapter({ TMUX: 't', HERDR_ENV: '1' })).toBe(tmuxSessionAdapter)
	})

	it('errors clearly when neither backend is detected', () => {
		expect(() => selectSessionAdapter({})).toThrow(/tmux.*herdr|herdr.*tmux/)
	})
})
