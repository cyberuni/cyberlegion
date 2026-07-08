import type { SessionAdapter, SessionReadOptions, SessionTarget } from './session.ts'

/**
 * herdr backend — detected via `$HERDR_ENV`. herdr (https://herdr.dev) is an agent-aware terminal
 * multiplexer that also reports real busy-state (working / idle / blocked / done); this adapter
 * only drives its pane lifecycle, not the state feed. Talks to herdr's own CLI (`herdr pane ...`)
 * rather than its Unix-socket API, so it composes with this codebase's synchronous `Exec`
 * convention exactly like the tmux adapter — no new client/transport needed.
 *
 * The pane lifecycle (split/run/read/close) is verified against a live herdr binary; `pane split`
 * returns a JSON `pane_info` envelope whose id is extracted in `parsePaneId`.
 */
export const herdrSessionAdapter: SessionAdapter = {
	name: 'herdr',

	open(exec, opts) {
		let id: string
		if (opts.at === 'workspace') {
			// A genuinely separate workspace, not a pane inside the caller's current one — `--no-focus`
			// so spawning doesn't steal the caller's attention/focus.
			const out = exec('herdr', ['workspace', 'create', '--cwd', opts.cwd, '--no-focus'])
			if (!out) throw new Error('herdr workspace create failed')
			id = parseWorkspaceRootPaneId(out)
		} else {
			const direction = opts.at === 'pane:down' ? 'down' : 'right'
			const out = exec('herdr', ['pane', 'split', '--current', '--direction', direction, '--cwd', opts.cwd])
			if (!out) throw new Error('herdr pane split failed')
			id = parsePaneId(out)
		}
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

/**
 * `herdr pane split` emits a JSON envelope, not a bare id:
 * `{"id":"cli:pane:split","result":{"pane":{"pane_id":"w3:pB", ...},"type":"pane_info"}}`.
 * The pane id herdr's other `pane` subcommands accept lives at `.result.pane.pane_id`. Extract it —
 * passing the whole blob downstream lands it in a filename and blows the path length limit.
 */
function parsePaneId(out: string): string {
	let paneId: unknown
	try {
		paneId = JSON.parse(out)?.result?.pane?.pane_id
	} catch {
		throw new Error(`herdr pane split returned unparseable output: ${out.slice(0, 200)}`)
	}
	if (typeof paneId !== 'string' || paneId === '') {
		throw new Error(`herdr pane split output had no result.pane.pane_id: ${out.slice(0, 200)}`)
	}
	return paneId
}

/**
 * `herdr workspace create` emits its new workspace's initial pane at `.result.root_pane.pane_id`
 * (a different path than `pane split`'s `.result.pane.pane_id`).
 */
function parseWorkspaceRootPaneId(out: string): string {
	let paneId: unknown
	try {
		paneId = JSON.parse(out)?.result?.root_pane?.pane_id
	} catch {
		throw new Error(`herdr workspace create returned unparseable output: ${out.slice(0, 200)}`)
	}
	if (typeof paneId !== 'string' || paneId === '') {
		throw new Error(`herdr workspace create output had no result.root_pane.pane_id: ${out.slice(0, 200)}`)
	}
	return paneId
}
