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

/** Cursor carries effort as a bracket parameter on the model (`<model>[effort=<level>]`): merge it into
 * any bracket list the model already has, replacing an `effort=` already there. */
function withCursorEffort(model: string, effort: string): string {
	const m = /^(.*)\[(.*)\]$/.exec(model)
	if (!m) return `${model}[effort=${effort}]`
	const params = m[2].split(',').filter((p) => p !== '' && !p.startsWith('effort='))
	return `${m[1]}[${[...params, `effort=${effort}`].join(',')}]`
}

/** The model + effort arguments for one harness. No two harnesses spell effort alike: claude has
 * `--effort`, codex only a config override, cursor only a parameter on the model — so a cursor
 * effort with no model has nowhere to go and throws rather than launching at the default effort. */
function modelAndEffortArgs(harness: Harness, model?: string, effort?: string): string[] {
	if (harness === 'cursor') {
		if (effort && !model) {
			throw new Error(
				`cursor carries effort only as a parameter on the model; set a model to launch with effort "${effort}"`,
			)
		}
		if (!model) return []
		return ['--model', shellQuote(effort ? withCursorEffort(model, effort) : model)]
	}
	const args = model ? ['--model', shellQuote(model)] : []
	if (!effort) return args
	if (harness === 'codex') return [...args, '-c', shellQuote(`model_reasoning_effort="${effort}"`)]
	return [...args, '--effort', shellQuote(effort)]
}

/** Build the harness launch invocation for a def — explicit `model`/`harness` win over the def's
 * own tags, which win over the harness default. The def's effort goes through the harness's own
 * effort control (see `modelAndEffortArgs`); `--append-system-prompt` carries the instructions. */
export function realizeLaunch(def: AgentDef, opts: RealizeLaunchOptions = {}): RealizedLaunch {
	const harness = opts.harness ?? def.harness ?? DEFAULT_HARNESS
	const model = opts.model ?? def.model
	const parts = [LAUNCH_MAP[harness], ...modelAndEffortArgs(harness, model, def.effort)]
	if (def.instructions) parts.push('--append-system-prompt', shellQuote(def.instructions))
	return { harness, command: parts.join(' ') }
}

/**
 * Resolve what `unit spawn` should launch, from either an explicit `--harness` or an agent def
 * (`--agent` / `--agent-file`) whose harness, model and instructions compose the launch command.
 * An explicit `--harness` overrides the def's own.
 *
 * Extracted from the CLI action so the def→launch wiring is reachable from a test: composed inline
 * it sat between two well-covered halves (`resolveAgentDef`, `realizeLaunch`) with nothing
 * exercising the join between them.
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
