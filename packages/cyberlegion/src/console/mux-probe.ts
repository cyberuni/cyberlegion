import type { Exec } from '../identity.ts'

export type Mux = 'tmux' | 'herdr' | 'screen' | 'none'

export interface MuxProbe {
	mux: Mux
	pane?: string
	/** 'env' — trusted the $CYBERLEGION_MUX fast-path/override. 'ancestry' — walked the process tree. */
	via: 'env' | 'ancestry'
}

const KNOWN_MUX: readonly Mux[] = ['tmux', 'herdr', 'screen', 'none']

function isKnownMux(v: string | undefined): v is Mux {
	return v != null && (KNOWN_MUX as readonly string[]).includes(v)
}

/**
 * Two-mode multiplexer detection.
 *
 * Fast-path: `$CYBERLEGION_MUX` (tmux | herdr | screen | none) is trusted outright — this also
 * serves as an OVERRIDE (`=none` forces no-mux even inside a real multiplexer). `$CYBERLEGION_MUX_PANE`
 * carries the pane id alongside it.
 *
 * Discovery (else): walk the process ancestry from `$$` via `ps -o ppid=,comm= -p <pid>`, since the
 * tool's own shell may not be the human's pane. `$TMUX`/`$HERDR_ENV` are NOT trusted alone — they
 * are used only as a fast-positive hint the ancestry walk falls back to when the walk itself is
 * inconclusive (e.g. `ps` unavailable), never as a substitute for it.
 */
export function probeMultiplexer(exec: Exec, env: NodeJS.ProcessEnv, opts: { discover?: boolean } = {}): MuxProbe {
	if (isKnownMux(env.CYBERLEGION_MUX)) {
		return {
			mux: env.CYBERLEGION_MUX,
			...(env.CYBERLEGION_MUX_PANE ? { pane: env.CYBERLEGION_MUX_PANE } : {}),
			via: 'env',
		}
	}
	if (opts.discover === false) return { mux: 'none', via: 'ancestry' }
	return discoverByAncestry(exec, env)
}

const MUX_COMM = [
	{ re: /^tmux(:|$)/, mux: 'tmux' as const, pane: (env: NodeJS.ProcessEnv) => env.TMUX_PANE },
	{ re: /^herdr(:|$)/, mux: 'herdr' as const, pane: (env: NodeJS.ProcessEnv) => env.HERDR_PANE },
	{ re: /^screen(:|$)/, mux: 'screen' as const, pane: () => undefined },
]

const MAX_ANCESTORS = 32

function walkAncestry(exec: Exec, env: NodeJS.ProcessEnv): MuxProbe | undefined {
	let pid = process.pid
	const seen = new Set<number>()
	for (let i = 0; i < MAX_ANCESTORS; i++) {
		if (seen.has(pid)) break
		seen.add(pid)
		const line = exec('ps', ['-o', 'ppid=,comm=', '-p', String(pid)])
		if (!line) break
		const trimmed = line.trim()
		const spaceIdx = trimmed.indexOf(' ')
		const ppidStr = spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx)
		const comm = spaceIdx === -1 ? '' : trimmed.slice(spaceIdx + 1).trim()
		const ppid = Number.parseInt(ppidStr, 10)
		for (const entry of MUX_COMM) {
			if (entry.re.test(comm)) return { mux: entry.mux, pane: entry.pane(env), via: 'ancestry' }
		}
		if (!Number.isFinite(ppid) || ppid <= 1) break
		pid = ppid
	}
	return undefined
}

function discoverByAncestry(exec: Exec, env: NodeJS.ProcessEnv): MuxProbe {
	const found = walkAncestry(exec, env)
	if (found) return found
	// Ancestry walk was inconclusive (no ps, or no mux ancestor found) — fall back to the
	// fast-positive env hint rather than declaring 'none' outright.
	if (env.TMUX) return { mux: 'tmux', pane: env.TMUX_PANE, via: 'ancestry' }
	if (env.HERDR_ENV) return { mux: 'herdr', pane: env.HERDR_PANE, via: 'ancestry' }
	return { mux: 'none', via: 'ancestry' }
}
