import type { SessionAdapter, SessionReadOptions, SessionTarget } from './session.ts'

/** tmux backend — detected via `$TMUX`. */
export const tmuxSessionAdapter: SessionAdapter = {
	name: 'tmux',

	open(exec, opts) {
		// tmux has no native "tab" concept — a new window is the closest analogue. 'workspace' maps to
		// a new detached session (`-d`, no `-t`) — genuinely separate from the caller's current
		// session, unlike every other placement, which targets it. Omitting `-s` lets tmux assign the
		// session name, avoiding any collision; the returned pane id is globally unique server-wide, so
		// every other adapter method keeps working unchanged regardless of which session a pane is in.
		const args =
			opts.at === 'workspace'
				? ['new-session', '-d', '-c', opts.cwd, '-P', '-F', '#{pane_id}']
				: opts.at === 'pane:down'
					? ['split-window', '-v', '-c', opts.cwd, '-P', '-F', '#{pane_id}']
					: opts.at === 'tab' || opts.at === 'window'
						? ['new-window', '-c', opts.cwd, '-P', '-F', '#{pane_id}']
						: ['split-window', '-h', '-c', opts.cwd, '-P', '-F', '#{pane_id}']
		const pane = exec('tmux', args)
		if (!pane) throw new Error(`tmux ${args[0]} failed`)
		const target: SessionTarget = { id: pane }
		tmuxSessionAdapter.send(exec, target, opts.launch)
		return target
	},

	send(exec, target, text) {
		exec('tmux', ['send-keys', '-t', target.id, text, 'Enter'])
	},

	read(exec, target, opts?: SessionReadOptions) {
		const args = ['capture-pane', '-p', '-t', target.id]
		if (opts?.lines != null) args.push('-S', `-${opts.lines}`)
		return exec('tmux', args) ?? ''
	},

	focus(exec, target) {
		exec('tmux', ['select-pane', '-t', target.id])
	},

	teardown(exec, target) {
		exec('tmux', ['kill-pane', '-t', target.id])
	},
}
