import type { SessionAdapter, SessionReadOptions, SessionTarget } from './session.ts'

/** tmux backend — detected via `$TMUX`. */
export const tmuxSessionAdapter: SessionAdapter = {
	name: 'tmux',

	open(exec, opts) {
		// tmux has no native "tab" concept — a new window is the closest analogue, and it's the
		// default placement. 'workspace' maps to a new detached session (`-d`, no `-t`) — genuinely
		// separate from the caller's current session, unlike every other placement, which targets it.
		// Omitting `-s` lets tmux assign the session name, avoiding any collision; the returned pane
		// id is globally unique server-wide, so every other adapter method keeps working unchanged
		// regardless of which session a pane is in.
		const at = opts.at ?? 'tab'
		const args =
			at === 'workspace'
				? ['new-session', '-d', '-c', opts.cwd, '-P', '-F', '#{pane_id}']
				: at === 'pane:down'
					? ['split-window', '-v', '-c', opts.cwd, '-P', '-F', '#{pane_id}']
					: at === 'tab'
						? // `-d` keeps focus on the caller (opens the tab in the background) — without it
							// tmux switches the attached client to the new window, stealing the caller's focus.
							// The returned pane id and subsequent `send-keys -t` still target the new pane.
							['new-window', '-d', '-c', opts.cwd, '-P', '-F', '#{pane_id}']
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

	paneExists(exec, target) {
		// `has-session` hits when the pane id happens to name a session; otherwise scan every pane
		// server-wide for the id (pane ids are globally unique across sessions).
		if (exec('tmux', ['has-session', '-t', target.id]) !== null) return true
		return (exec('tmux', ['list-panes', '-a', '-F', '#{pane_id}']) ?? '').split('\n').includes(target.id)
	},
}
