import { herdrMuxAdapter, type MuxAdapter, type MuxProbe, probeMultiplexer, tmuxMuxAdapter } from 'cyber-mux'
import { type Exec, realExec } from './identity.ts'
import { normalizeMuxEnv } from './mux-env.ts'

/**
 * Backend selection via cyber-mux's two-mode mux probe, normalized through the transitional
 * `$CYBERLEGION_MUX*` → `$CYBER_MUX*` env seam (`mux-env.ts`) — tmux/herdr map to their existing
 * cyber-mux adapters.
 *
 * cyber-mux detects MORE backends than `unit/registry`'s `AgentRecord.pane` can carry a locator
 * under (`'tmux' | 'herdr'` only). A DETECTED wezterm/zellij is refused HERE, before anything opens,
 * naming the backend it found (mux.feature: "a detected backend a unit record cannot carry is
 * refused before opening anything") — driving it would open a real pane no record could name,
 * stranding a live session `prune` can never reap and no caller can nudge. Anything else (`none`,
 * `screen`) falls through to the plain "no backend" refusal, unchanged from before the migration.
 */
export function selectSessionAdapter(env: NodeJS.ProcessEnv, exec: Exec = realExec): MuxAdapter {
	return adapterFor(probeMultiplexer(exec, normalizeMuxEnv(env)))
}

/** Where `unit spawn` hosts a new unit's session: a multiplexer's adapter, or a Claude background
 * session (`background.ts`). */
export type SpawnBackend = { kind: 'mux'; adapter: MuxAdapter } | { kind: 'claude-bg' }

/**
 * Spawn's backend, keyed on the unit's harness as well as the environment (ADR-0036): a detected tmux
 * or herdr wins; with no multiplexer at all, a `claude` unit runs in a Claude background session;
 * anything else is `selectSessionAdapter`'s refusal. The background session is the fallback for NO
 * multiplexer, not for an unsupported one — a detected wezterm or zellij is still refused. Kept apart
 * from `selectSessionAdapter`, which stays multiplexer-only (`mux mode` reports `none` outside one).
 */
export function selectSpawnBackend(env: NodeJS.ProcessEnv, exec: Exec, harness: string): SpawnBackend {
	const probe = probeMultiplexer(exec, normalizeMuxEnv(env))
	if (probe.mux === 'none' && harness === 'claude') return { kind: 'claude-bg' }
	return { kind: 'mux', adapter: adapterFor(probe) }
}

function adapterFor(probe: MuxProbe): MuxAdapter {
	if (probe.mux === 'tmux') return tmuxMuxAdapter
	if (probe.mux === 'herdr') return herdrMuxAdapter
	if (probe.mux === 'wezterm' || probe.mux === 'zellij') {
		throw new Error(
			`spawn detected ${probe.mux}, a backend unit/registry cannot store a pane locator under ` +
				'(only tmux and herdr) — refusing before opening anything',
		)
	}
	throw new Error('spawn requires a session backend — run inside tmux ($TMUX) or herdr ($HERDR_ENV=1)')
}
