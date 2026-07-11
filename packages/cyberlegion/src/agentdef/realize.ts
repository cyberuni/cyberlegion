// Pure string builders that turn a resolved AgentDef into what a caller actually does with it —
// never spawns anything itself. `realizeLaunch` builds the launch invocation for a CHANNEL (warm
// peer session, its own harness process). Building a SUBAGENT's Task-tool instruction is the
// caller's own concern (see the subagent-backend-governance plugin skill) — cyberlegion cannot
// invoke that tool itself and no longer carries a result-slot counterpart for it.

import type { Harness } from '../identity.ts'
import { LAUNCH_MAP } from '../session.ts'
import type { AgentDef } from './resolve.ts'

const DEFAULT_HARNESS: Harness = 'claude'

/** POSIX single-quote a value for safe inclusion in a shell command line. */
export function shellQuote(value: string): string {
	return `'${value.replace(/'/g, `'\\''`)}'`
}

export interface RealizeLaunchOptions {
	/** Overrides def.model when present. */
	model?: string
	/** Overrides def.harness when present; falls back to 'claude' when neither is set. */
	harness?: Harness
}

export interface RealizedLaunch {
	harness: Harness
	command: string
}

/** Build the harness launch invocation for a def — explicit `model`/`harness` win over the def's
 * own tags, which win over the harness default. Every harness gets the same shape (bin,
 * `--model` when known, `--append-system-prompt` carrying the def's instructions body) since the
 * exact per-harness flag surface is realized later by the launching caller, not by cyberlegion. */
export function realizeLaunch(def: AgentDef, opts: RealizeLaunchOptions = {}): RealizedLaunch {
	const harness = opts.harness ?? def.harness ?? DEFAULT_HARNESS
	const model = opts.model ?? def.model
	const bin = LAUNCH_MAP[harness]
	const parts = [bin]
	if (model) parts.push('--model', shellQuote(model))
	if (def.instructions) parts.push('--append-system-prompt', shellQuote(def.instructions))
	return { harness, command: parts.join(' ') }
}
