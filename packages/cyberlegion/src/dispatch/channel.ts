// The CHANNEL path: the one CLI-driven convenience. Its result channel is MAIL on the thread — an
// async peer sends `mail send --thread <id>`, and (with --wait) this awaits it — never a result
// file (that's the SUBAGENT path's channel; see `collect.ts`). `channel` preps an envelope, spawns
// a genuine peer session (a real harness process, needing a multiplexer — surfaced as a clear error
// via `spawn`'s own `selectSessionAdapter` when none is available), and optionally blocks for the
// reply.

import { realizeLaunch } from '../agentdef/realize.ts'
import { resolveAgentDef } from '../agentdef/resolve.ts'
import type { SessionPlacement } from '../console/session.ts'
import type { IdContext } from '../identity.ts'
import { resolveSelfId } from '../identity.ts'
import { spawn } from '../session.ts'
import { awaitReply } from '../wake/await.ts'
import { type DispatchEnvelope, type PrepInput, prep } from './prep.ts'
import { validateVerdict } from './verdict.ts'

export interface ChannelInput extends PrepInput {
	/** Block for the mail-thread reply and return a validated `DispatchResult`; without it, the peer
	 * is spawned and the envelope is returned so the caller can `mail await` later. */
	wait?: boolean
	/** Placement relative to the caller; defaults to 'pane:right'. */
	at?: SessionPlacement
	timeoutMs?: number
	maxWaitS?: number
}

export interface DispatchResult {
	id: string
	verdict?: unknown
	body: string
	ts: number
}

/** Thrown by a `--wait` channel call when its internal poll-cycle cap is hit with no reply yet — a
 * clean, re-armable sentinel (mirrors `mail await`'s "waiting" outcome), never a failure. */
export class DispatchWaitingError extends Error {
	constructor(public readonly thread: string) {
		super(`waiting — no reply on thread "${thread}" yet; re-run to keep waiting`)
	}
}

/**
 * `prep()` + spawn a peer session realized from the same agent def + (optionally) `awaitReply` on
 * the thread. Requires `--agent`/`--agent-file` (a channel peer needs a real launch to realize).
 */
export async function channel(
	ctx: IdContext,
	input: ChannelInput,
	readStdin?: () => string,
): Promise<DispatchResult | DispatchEnvelope> {
	if (!input.agent && !input.agentFile) {
		throw new Error('dispatch channel needs --agent <name> or --agent-file <path> to realize the peer launch')
	}
	const envelope = prep(ctx, input, readStdin)
	const def = resolveAgentDef({ name: input.agent, file: input.agentFile })
	const realized = realizeLaunch(def)
	// spawn() itself resolves the session backend and throws a clear error when no multiplexer is
	// available — the channel path's own error surface, not re-derived here.
	spawn(ctx, { harness: realized.harness, command: realized.command, briefFile: envelope.briefFile, at: input.at })

	if (!input.wait) return envelope

	const meId = resolveSelfId(ctx)
	if (!meId) throw new Error('dispatch channel --wait needs an identity — run `cyberlegion identity register` first')
	const outcome = await awaitReply(
		{ store: ctx.store, now: ctx.now },
		{ meId, thread: envelope.thread, timeoutMs: input.timeoutMs, maxWaitS: input.maxWaitS },
	)
	if (outcome.kind === 'waiting') throw new DispatchWaitingError(envelope.thread)
	if (outcome.kind === 'timed-out') throw new Error(`no reply on thread "${envelope.thread}" within timeout`)

	const validated = validateVerdict(outcome.message.body, input.verdictSchema)
	if (!validated.ok) throw new Error(validated.error)
	return { id: envelope.id, verdict: validated.value, body: outcome.message.body, ts: outcome.message.ts }
}
