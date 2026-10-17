import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { type Exec, nodeExec } from 'cyber-mux'

// A stand-in for the Claude Code CLI behind an injected `Exec`, for the background-session backend's
// tests (`background.ts`). It answers each `claude` subcommand the backend runs the way Claude Code
// does (the unit/background facts table), and records every call so a test can assert what ran and
// what did not. Nothing here starts a real session.

/** One session as `claude agents --json --all` lists it. */
export interface ListedSession {
	id: string
	sessionId: string
	/** Whether a turn is running: absent for an entry with no process. */
	status?: 'idle' | 'busy'
	/** Claude Code's judgement of the task, independent of whether a turn runs. */
	state: 'working' | 'done' | 'blocked' | 'stopped' | 'failed'
}

/** A listed session whose full id starts with its short id, as Claude Code's do. */
export function listed(id: string, at: Pick<ListedSession, 'status' | 'state'>): ListedSession {
	return { id, sessionId: `${id}-1111-4222-8333-444455556666`, ...at }
}

/** How one command answers: its stdout on exit 0, or its stderr on a non-zero exit. */
type Answer = { stdout: string } | { stderr: string }

export interface FakeClaudeOptions {
	/** `claude --bg` (run through `sh -c`). Default: exit 0 printing a `backgrounded` line for `a1b2c3d4`. */
	start?: Answer
	/** The listing before any `claude stop`, or `unreadable` for a non-zero exit. Default: empty. */
	listing?: ListedSession[] | 'unreadable'
	/** The listing once a `claude stop` has run. Default: the listing before it. */
	listingAfterStop?: ListedSession[] | 'unreadable'
	stop?: Answer
	rm?: Answer
	/** `claude --bg --resume`. Default: exit 0 saying it woke the resumed session's short id. */
	resume?: (sessionId: string) => Answer
	logs?: Answer
	/** Every other command (git, tmux, `ps`). Default: a failure. */
	other?: Exec
	/** Run the `sh -c` start line through a real shell instead of answering it here. */
	realShell?: boolean
}

export interface FakeClaude {
	exec: Exec
	/** Every call, in order. */
	calls: string[][]
	/** The `claude` subcommands run (`agents`, `stop`, `rm`, `logs`, `--bg` for a resume), each with its args. */
	claude: () => string[][]
	/** The shell lines that started a background session. */
	starts: () => string[]
	/** Every call the multiplexer layer made (tmux, herdr, wezterm, zellij). */
	muxCalls: () => string[][]
}

const MUX_BINARIES = new Set(['tmux', 'herdr', 'wezterm', 'zellij'])

export function fakeClaude(o: FakeClaudeOptions = {}): FakeClaude {
	const calls: string[][] = []
	let stopped = false
	const exec: Exec = (cmd, args) => {
		calls.push([cmd, ...args])
		exec.lastError = undefined
		const answer = (a: Answer): string | null => {
			if ('stderr' in a) {
				exec.lastError = a.stderr
				return null
			}
			return a.stdout
		}
		if (cmd === 'sh' && args[0] === '-c' && /--bg/.test(args[1] ?? '')) {
			if (o.realShell) {
				const out = nodeExec(cmd, args)
				exec.lastError = nodeExec.lastError
				return out
			}
			return answer(o.start ?? { stdout: 'backgrounded · a1b2c3d4 · unit' })
		}
		if (cmd !== 'claude') return o.other ? o.other(cmd, args) : null
		const [sub] = args
		if (sub === 'agents') {
			const l = stopped && o.listingAfterStop !== undefined ? o.listingAfterStop : (o.listing ?? [])
			if (l === 'unreadable') return answer({ stderr: 'background service unavailable' })
			return JSON.stringify(l.map((s) => ({ ...s, cwd: '/w', kind: 'bg', name: 'unit' })))
		}
		if (sub === 'stop') {
			stopped = true
			return answer(o.stop ?? { stdout: '' })
		}
		if (sub === 'rm') return answer(o.rm ?? { stdout: '' })
		if (sub === 'logs') return answer(o.logs ?? { stdout: '' })
		if (sub === '--bg' && args[1] === '--resume') {
			const sessionId = args[2] ?? ''
			return answer(
				o.resume ? o.resume(sessionId) : { stdout: `note: woke session ${sessionId.slice(0, 8)} with a new prompt` },
			)
		}
		return null
	}
	return {
		exec,
		calls,
		claude: () => calls.filter((c) => c[0] === 'claude').map((c) => c.slice(1)),
		starts: () => calls.filter((c) => c[0] === 'sh' && /--bg/.test(c[2] ?? '')).map((c) => c[2] as string),
		muxCalls: () => calls.filter((c) => MUX_BINARIES.has(c[0] as string)),
	}
}

/**
 * A `claude` executable that records how it was started — its working directory, `$CYBERLEGION_AGENT_ID`,
 * `$PATH`, and its arguments one per line — and prints a `backgrounded` line for `short`. For a test that
 * runs the start line through a real shell.
 */
export function stubClaudeBinary(short: string): { dir: string; bin: string; seen: () => StubRun } {
	const dir = mkdtempSync(join(tmpdir(), 'cl-claude-stub-'))
	const out = join(dir, 'seen')
	mkdirSync(out)
	const bin = join(dir, 'claude')
	writeFileSync(
		bin,
		[
			'#!/bin/sh',
			`pwd -P > '${out}/cwd'`,
			`printf '%s' "$CYBERLEGION_AGENT_ID" > '${out}/id'`,
			`printf '%s' "$PATH" > '${out}/path'`,
			`printf '%s\\n' "$@" > '${out}/args'`,
			`echo "backgrounded · ${short} · stub"`,
			'',
		].join('\n'),
	)
	chmodSync(bin, 0o755)
	return {
		dir,
		bin,
		seen: () => ({
			cwd: readFileSync(join(out, 'cwd'), 'utf8').trim(),
			id: readFileSync(join(out, 'id'), 'utf8'),
			path: readFileSync(join(out, 'path'), 'utf8'),
			args: readFileSync(join(out, 'args'), 'utf8').replace(/\n$/, '').split('\n'),
		}),
	}
}

interface StubRun {
	cwd: string
	id: string
	path: string
	args: string[]
}
