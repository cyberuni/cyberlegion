import { type Exec, herdrMuxAdapter, probeMultiplexer, tmuxMuxAdapter } from 'cyber-mux'
import { describe, expect, it } from 'vitest'
import { normalizeMuxEnv } from './mux-env.ts'

// spec: mux/mux.feature — the boundary this suite exists to close. cyberlegion consumes
// probeMultiplexer/tmuxMuxAdapter/herdrMuxAdapter straight from cyber-mux with no fork of its own;
// upstream's own test suite protects THAT package's behavior, not this project's frozen contract —
// the dependency can be re-pinned or its dist patched and cyberlegion's suite would stay green with
// no check here. Every test below drives the REAL cyber-mux exports with an injected fake `exec`,
// so a regression in the installed dist fails these tests too.
describe('spec:cyberlegion/mux', () => {
	it('$CYBER_MUX=none is an override even inside a real multiplexer', () => {
		// The fake exec answers ps as if a real tmux ancestor is one hop up — proving the override
		// short-circuits before the ancestry walk is ever consulted, not merely that no walk happened
		// to fire.
		const exec: Exec = (cmd, args) => (cmd === 'ps' && args[0] === '-o' ? '1 tmux: server' : null)
		const probe = probeMultiplexer(exec, normalizeMuxEnv({ CYBER_MUX: 'none', TMUX: 't' }))
		expect(probe.mux).toBe('none')
	})

	it('absent every env fast-path, the probe walks the process ancestry from $$', () => {
		const pid = process.pid
		// Two hops: the tool's own shell first (not a mux), then a tmux server ancestor above it —
		// proving the walk actually climbs rather than stopping at the immediate parent.
		const exec: Exec = (cmd, args) => {
			if (cmd !== 'ps') return null
			const queried = Number.parseInt(args[args.length - 1] ?? '', 10)
			if (queried === pid) return `${pid + 1} bash`
			if (queried === pid + 1) return '1 tmux: server'
			return null
		}
		const probe = probeMultiplexer(exec, normalizeMuxEnv({}))
		expect(probe.mux).toBe('tmux')
		expect(probe.via).toBe('ancestry')
	})

	it('tmux reports a pane focused when an attached client is currently viewing it', () => {
		const exec: Exec = (cmd, args) =>
			cmd === 'tmux' && args[0] === 'list-panes' ? '%1 0 1 1\n%3 1 1 1\n%7 0 0 0' : null
		expect(tmuxMuxAdapter.isPaneFocused(exec, { id: '%3' })).toBe(true)
	})

	it('tmux reports a pane not focused when no attached client is viewing it', () => {
		const exec: Exec = (cmd, args) =>
			cmd === 'tmux' && args[0] === 'list-panes' ? '%1 0 1 1\n%3 0 1 1\n%7 1 0 1\n%9 1 1 0' : null
		// not the active pane of its window
		expect(tmuxMuxAdapter.isPaneFocused(exec, { id: '%3' })).toBe(false)
		// window not current
		expect(tmuxMuxAdapter.isPaneFocused(exec, { id: '%7' })).toBe(false)
		// session has no attached client
		expect(tmuxMuxAdapter.isPaneFocused(exec, { id: '%9' })).toBe(false)
	})

	it('herdr reports a pane focused when its pane record is focused', () => {
		const out = JSON.stringify({ result: { pane: { pane_id: 'w3:pB', focused: true } } })
		const exec: Exec = (cmd, args) => (cmd === 'herdr' && args[0] === 'pane' && args[1] === 'get' ? out : null)
		expect(herdrMuxAdapter.isPaneFocused(exec, { id: 'w3:pB' })).toBe(true)
	})

	it('herdr reports a pane not focused when its pane record is not focused', () => {
		const out = JSON.stringify({ result: { pane: { pane_id: 'w3:pB', focused: false } } })
		const exec: Exec = (cmd, args) => (cmd === 'herdr' && args[0] === 'pane' && args[1] === 'get' ? out : null)
		expect(herdrMuxAdapter.isPaneFocused(exec, { id: 'w3:pB' })).toBe(false)
	})

	it('a focus query that cannot be answered is unknown, not a boolean', () => {
		// tmux: the pane is missing from the listing, or the backend returns nothing at all.
		const tmuxPartial: Exec = () => '%1 1 1 1'
		expect(tmuxMuxAdapter.isPaneFocused(tmuxPartial, { id: '%3' })).toBeUndefined()
		expect(tmuxMuxAdapter.isPaneFocused(() => null, { id: '%3' })).toBeUndefined()

		// herdr: an error envelope, an unresolvable pane (exec fails), or unparseable output.
		const herdrError: Exec = () => JSON.stringify({ error: { code: 'pane_not_found' } })
		expect(herdrMuxAdapter.isPaneFocused(herdrError, { id: 'gone' })).toBeUndefined()
		expect(herdrMuxAdapter.isPaneFocused(() => null, { id: 'gone' })).toBeUndefined()
		expect(herdrMuxAdapter.isPaneFocused(() => 'not json', { id: 'w3:pB' })).toBeUndefined()
	})
})
