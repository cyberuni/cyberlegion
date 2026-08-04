// Pure string builders that turn a resolved AgentDef into what a caller actually does with it —
// never spawns anything itself. `realizeLaunch` builds the launch invocation for a CHANNEL (warm
// peer session, its own harness process). Building a SUBAGENT's Task-tool instruction is the
// caller's own concern (see the subagent-backend-governance plugin skill) — cyberlegion cannot
// invoke that tool itself and no longer carries a result-slot counterpart for it.

import type { Harness } from '../identity.ts'
import { LAUNCH_MAP } from '../session.ts'
import { type AgentDef, resolveAgentDef } from './resolve.ts'

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

/**
 * Resolve what `unit spawn` should launch, from either an explicit `--harness` or an agent def
 * (`--agent` / `--agent-file`) whose harness, model and instructions compose the launch command.
 * An explicit `--harness` overrides the def's own.
 *
 * Extracted from the CLI action so the def→launch wiring is testable: composed inline it sat
 * between two well-tested halves (`resolveAgentDef`, `realizeLaunch`) with nothing exercising the
 * join, so replacing the whole resolution with a constant left the suite green.
 */
export function resolveSpawnLaunch(input: {
	agent?: string
	agentFile?: string
	harness?: string
	cwd?: string
	searchRoots?: string[]
}): { harness?: string; command?: string } {
	if (!input.agent && !input.agentFile) return { harness: input.harness }
	const def = resolveAgentDef({
		name: input.agent,
		file: input.agentFile,
		...(input.cwd ? { cwd: input.cwd } : {}),
		...(input.searchRoots ? { searchRoots: input.searchRoots } : {}),
	})
	const realized = realizeLaunch(def, { harness: input.harness as Harness | undefined })
	return { harness: realized.harness, command: realized.command }
}
