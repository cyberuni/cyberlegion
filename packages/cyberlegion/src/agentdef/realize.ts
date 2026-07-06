// Pure string builders that turn a resolved AgentDef into what a caller actually does with it —
// never spawns anything itself. Two families: `realizeLaunch` for a CHANNEL (warm peer session,
// its own harness process) and `realizeSubagentInstruction` for a SUBAGENT (the parent model's
// own Task-tool spawn, in-process — cyberlegion cannot invoke that tool itself).

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

export interface RealizeSubagentOptions {
	/** File the spawned subagent reads its brief from. */
	briefFile: string
	/** File the spawned subagent writes its result JSON to. */
	resultFile: string
}

/** Build the instruction string a parent model uses to spawn its OWN harness Task subagent for
 * `def` — cyberlegion never invokes the Task tool itself. Names `subagent_type: <def.name>` for a
 * harness that recognizes it, but always inlines the model + full instructions too so the same
 * instruction string is correct even when the harness has no such named subagent type. */
export function realizeSubagentInstruction(def: AgentDef, opts: RealizeSubagentOptions): string {
	const lines: string[] = [
		`Spawn a subagent (subagent_type: ${def.name} if your harness recognizes that name, else a generic one).`,
	]
	if (def.model) lines.push(`Model: ${def.model}.`)
	if (def.effort) lines.push(`Effort: ${def.effort}.`)
	lines.push(`Read the brief at ${opts.briefFile} and write its result JSON to ${opts.resultFile}.`)
	if (def.instructions) lines.push('', 'Instructions:', def.instructions)
	return lines.join('\n')
}
