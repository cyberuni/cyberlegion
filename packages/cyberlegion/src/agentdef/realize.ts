// Pure builders that turn a resolved AgentDef into what a caller actually does with it —
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
	/** Overrides def.effort when present. */
	effort?: string
	/** Overrides def.harness when present; falls back to 'claude' when neither is set. */
	harness?: Harness
}

export interface RealizedLaunch {
	harness: Harness
	command: string
	/** The model and effort the command launches with, from whichever source won; absent when the
	 * harness default applies. */
	model?: string
	effort?: string
	/** The def's instructions, for a harness whose CLI cannot take them (cursor): `unit spawn` writes
	 * them in front of the brief instead. Absent when the command carries them, or there are none. */
	briefInstructions?: string
}

/** Cursor carries effort as a bracket parameter on the model (`<model>[effort=<level>]`): merge it into
 * any bracket list the model already has, replacing an `effort=` already there. */
function withCursorEffort(model: string, effort: string): string {
	// String ops, not a regex: `/^(.*)\[(.*)\]$/` backtracks polynomially on a crafted model string.
	const open = model.lastIndexOf('[')
	if (open === -1 || !model.endsWith(']')) return `${model}[effort=${effort}]`
	const params = model
		.slice(open + 1, -1)
		.split(',')
		.filter((p) => p !== '' && !p.startsWith('effort='))
	return `${model.slice(0, open)}[${[...params, `effort=${effort}`].join(',')}]`
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

/** A TOML basic string: JSON's escapes are all legal TOML escapes, and TOML also forbids a raw DEL. */
function tomlBasicString(value: string): string {
	return JSON.stringify(value).replace(/\x7f/g, '\\u007f')
}

/** The instruction arguments for one harness. Only claude has an append-to-system-prompt flag;
 * codex takes a `developer_instructions` config override, added on top of its own base
 * instructions. Cursor has no channel at all — its instructions go to the brief instead. */
function instructionArgs(harness: Harness, instructions: string): string[] {
	if (!instructions || harness === 'cursor') return []
	if (harness === 'claude') return ['--append-system-prompt', shellQuote(instructions)]
	return ['-c', shellQuote(`developer_instructions=${tomlBasicString(instructions)}`)]
}

/** Build the harness launch invocation for a def — explicit `model`/`effort`/`harness` win over the
 * def's own tags, which win over the harness default. The def's effort and instructions each go
 * through the harness's own control (see `modelAndEffortArgs`, `instructionArgs`). */
export function realizeLaunch(def: AgentDef, opts: RealizeLaunchOptions = {}): RealizedLaunch {
	const harness = opts.harness ?? def.harness ?? DEFAULT_HARNESS
	const model = opts.model ?? def.model
	const effort = opts.effort ?? def.effort
	const parts = [
		LAUNCH_MAP[harness],
		...modelAndEffortArgs(harness, model, effort),
		...instructionArgs(harness, def.instructions),
	]
	const briefInstructions = harness === 'cursor' && def.instructions ? def.instructions : undefined
	return { harness, command: parts.join(' '), model, effort, ...(briefInstructions ? { briefInstructions } : {}) }
}

/**
 * Resolve what `unit spawn` should launch, from either an explicit `--harness` or an agent def
 * (`--agent` / `--agent-file`) whose harness, model, effort and instructions compose the launch
 * command. An explicit `--harness`/`--model`/`--effort` overrides the def's own, for this launch only.
 * With no def, a `--model`/`--effort` composes a launch from `--harness` alone; with neither, the
 * harness's own default command stands (no `command` returned).
 *
 * Extracted from the CLI action so the def→launch wiring is reachable from a test: composed inline
 * it sat between two well-covered halves (`resolveAgentDef`, `realizeLaunch`) with nothing
 * exercising the join between them.
 */
export function resolveSpawnLaunch(input: {
	agent?: string
	agentFile?: string
	harness?: string
	model?: string
	effort?: string
	cwd?: string
	searchRoots?: string[]
}): { harness?: string; command?: string; model?: string; effort?: string; briefInstructions?: string } {
	const overrides = { harness: input.harness as Harness | undefined, model: input.model, effort: input.effort }
	if (!input.agent && !input.agentFile) {
		if (!input.harness || (!input.model && !input.effort)) return { harness: input.harness }
		return realizeLaunch({ name: input.harness, instructions: '', path: '' }, overrides)
	}
	const def = resolveAgentDef({
		name: input.agent,
		file: input.agentFile,
		...(input.cwd ? { cwd: input.cwd } : {}),
		...(input.searchRoots ? { searchRoots: input.searchRoots } : {}),
	})
	return realizeLaunch(def, overrides)
}
