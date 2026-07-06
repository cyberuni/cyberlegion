import type { SessionAdapter, SessionReadOptions, SessionTarget } from './session.ts'

/**
 * herdr backend — detected via `$HERDR_ENV`. herdr (https://herdr.dev) is an agent-aware terminal
 * multiplexer that also reports real busy-state (working / idle / blocked / done); this adapter
 * only drives its pane lifecycle, not the state feed. Talks to herdr's own CLI (`herdr pane ...`)
 * rather than its Unix-socket API, so it composes with this codebase's synchronous `Exec`
 * convention exactly like the tmux adapter — no new client/transport needed.
 *
 * herdr is optional/experimental and is not installed in this environment; this follows herdr's
 * documented CLI reference (split/run/read/close/focus) but is unverified against a live binary.
 */
export const herdrSessionAdapter: SessionAdapter = {
	name: 'herdr',

	open(exec, opts) {
		const direction = opts.at === 'pane:down' ? 'down' : 'right'
		const id = exec('herdr', ['pane', 'split', '--current', '--direction', direction, '--cwd', opts.cwd])
		if (!id) throw new Error('herdr pane split failed')
		const target: SessionTarget = { id }
		// `pane run` submits text plus Enter atomically — herdr's documented preference over
		// send-text + send-keys Enter for launching a command.
		exec('herdr', ['pane', 'run', id, opts.launch])
		return target
	},

	send(exec, target, text) {
		exec('herdr', ['pane', 'run', target.id, text])
	},

	read(exec, target, opts?: SessionReadOptions) {
		const args = ['pane', 'read', target.id, '--source', 'visible']
		if (opts?.lines != null) args.push('--lines', String(opts.lines))
		return exec('herdr', args) ?? ''
	},

	focus(exec, target) {
		exec('herdr', ['pane', 'focus', target.id])
	},

	teardown(exec, target) {
		exec('herdr', ['pane', 'close', target.id])
	},
}
