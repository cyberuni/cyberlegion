// The one dispatch primitive every path shares: mint an id, write the brief, allocate the result
// slot, and build the instruction a caller hands to its own spawn mechanism. Spawns nothing and
// never invokes a harness Task tool — that stays the caller's (a subagent path: the parent's own
// Task tool; a channel path: `channel()` below composes this with `session spawn`).

import { realizeSubagentInstruction } from '../agentdef/realize.ts'
import { type AgentDef, resolveAgentDef } from '../agentdef/resolve.ts'
import { randomId } from '../identity.ts'
import { resolveBody } from '../message.ts'
import { paths } from '../paths.ts'
import type { Store } from '../store/store.ts'

export interface DispatchContext {
	store: Store
}

export interface PrepInput {
	/** Resolve an agent def (`.agents/agents/<name>.md`) to build the instruction from. */
	agent?: string
	/** Read an exact agent def file instead of resolving by name (plugin-scoped escape hatch). */
	agentFile?: string
	/** Role label folded into the generic instruction when no agent def is given. */
	role?: string
	/** Brief body text. */
	briefText?: string
	/** Read the brief from a file, or `-` for stdin. */
	briefFile?: string
	/** JSON schema file the eventual result must satisfy — carried through by callers that validate. */
	verdictSchema?: string
	/** Thread id correlating a channel-path reply; defaults to the minted dispatch id. */
	thread?: string
}

export interface DispatchEnvelope {
	id: string
	thread: string
	briefFile: string
	resultFile: string
	instruction: string
}

/** The instruction a caller uses when no agent def is given — still names both slot paths so a
 * generic Task-tool spawn (or a human) can carry out the same contract. */
function genericInstruction(role: string | undefined, briefFile: string, resultFile: string): string {
	const lines = [`Spawn a subagent${role ? ` (role: ${role})` : ''}.`]
	lines.push(`Read the brief at ${briefFile} and write its result JSON to ${resultFile}.`)
	return lines.join('\n')
}

/**
 * Allocate a dispatch: mint an id (thread defaults to it), write the brief into the Store, compute
 * the result-slot path, and build the instruction from a resolved agent def (or a generic one).
 * Spawns nothing — the envelope is handed to whatever spawns next (a Task tool, `channel()`, a
 * human).
 */
export function prep(ctx: DispatchContext, input: PrepInput, readStdin?: () => string): DispatchEnvelope {
	const id = randomId()
	const thread = input.thread ?? id
	const briefText = resolveBody(input.briefText, input.briefFile, readStdin)
	ctx.store.writeBrief(id, briefText)
	const briefFile = paths.briefFile(ctx.store.root, id)
	const resultFile = ctx.store.resultPath(id)

	let def: AgentDef | undefined
	if (input.agent || input.agentFile) {
		def = resolveAgentDef({ name: input.agent, file: input.agentFile })
	}
	const instruction = def
		? realizeSubagentInstruction(def, { briefFile, resultFile })
		: genericInstruction(input.role, briefFile, resultFile)

	return { id, thread, briefFile, resultFile, instruction }
}
