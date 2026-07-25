import type { Exec } from 'cyber-mux'
import { describe, expect, it } from 'vitest'
import { selectSessionAdapter } from './mux-select.ts'

const nullExec: Exec = () => null

// spec: mux/mux.feature — "the session backend is selected by environment", "neither tmux nor herdr
// detected errors before opening anything", and "a detected backend a unit record cannot carry is
// refused before opening anything". This GUARD is cyberlegion's own replacement for the fork's
// `selectSessionAdapter` — cyber-mux itself happily drives wezterm/zellij, so the refusal has to live
// here, before `unit spawn` ever calls `.open()`.
describe('spec:cyberlegion/mux-select', () => {
	it('binds the tmux adapter when $TMUX is set', () => {
		expect(selectSessionAdapter({ TMUX: 't' }, nullExec).name).toBe('tmux')
	})

	it('binds the herdr adapter when $HERDR_ENV is set and no $TMUX', () => {
		expect(selectSessionAdapter({ HERDR_ENV: '1' }, nullExec).name).toBe('herdr')
	})

	it('throws naming tmux/herdr when neither is detected', () => {
		expect(() => selectSessionAdapter({}, nullExec)).toThrow(/tmux/)
		expect(() => selectSessionAdapter({}, nullExec)).toThrow(/herdr/)
	})

	it.each([
		'wezterm',
		'zellij',
	] as const)('refuses a detected %s outright, naming it as detected-but-unsupported', (mux) => {
		expect(() => selectSessionAdapter({ CYBER_MUX: mux }, nullExec)).toThrow(new RegExp(mux))
	})

	it('the legacy $CYBERLEGION_MUX fast-path still selects a backend via the transitional env seam', () => {
		expect(selectSessionAdapter({ CYBERLEGION_MUX: 'herdr' }, nullExec).name).toBe('herdr')
	})

	it('the current $CYBER_MUX pair wins over the legacy pair when both are set', () => {
		expect(selectSessionAdapter({ CYBER_MUX: 'tmux', CYBERLEGION_MUX: 'herdr' }, nullExec).name).toBe('tmux')
	})
})
