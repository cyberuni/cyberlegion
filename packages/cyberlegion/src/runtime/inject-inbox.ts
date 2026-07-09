import { currentPane } from '../console/mux-probe.ts'
import { type IdContext, listAgents, loadAgent, register, resolveSelfId, saveAgent } from '../identity.ts'
import { inbox } from '../message.ts'

export type HookEvent = 'SessionStart' | 'PostToolUse'
const EVENTS: HookEvent[] = ['SessionStart', 'PostToolUse']

export interface InjectPayload {
	hookSpecificOutput: { hookEventName: HookEvent; additionalContext: string }
}

/**
 * Resolve the calling agent, gather its pending brief + unread mail, and return the
 * SessionStart-style injection payload — or null when there is nothing to inject (an
 * unregistered caller or an empty inbox never fails the harness hook).
 */
export function injectInbox(ctx: IdContext, event: string): InjectPayload | null {
	if (!EVENTS.includes(event as HookEvent)) {
		throw new Error(`unsupported --event "${event}" (expected ${EVENTS.join(' | ')})`)
	}
	let meId = resolveSelfId(ctx)
	if (!meId) {
		// No identity yet. If the session IS in a live multiplexer pane, self-register it here so a
		// human who never ran `identity register` still gets a first-class hub presence. Best-effort:
		// a register failure (e.g. no detectable harness) must never fail the harness turn.
		if (currentPane(ctx.env ?? process.env)) {
			try {
				register(ctx, {})
				meId = resolveSelfId(ctx)
			} catch {
				return null
			}
		}
		if (!meId) return null // still no id (no pane, or auto-register failed) — inject nothing, no error
	}

	const parts: string[] = []
	const rec = loadAgent(ctx.store, meId)
	if (rec?.status === 'spawning') {
		const brief = ctx.store.readBrief(meId)
		if (brief) {
			parts.push(`## Your brief\n\n${brief.trim()}`)
		}
		rec.status = 'active'
		saveAgent(ctx.store, rec)
	}

	const unread = inbox({ store: ctx.store }, { meId, unread: true })
	if (unread.length > 0) {
		const lines = unread.map(
			(m) => `- **${m.fromHandle}**${m.subject ? ` — ${m.subject}` : ''}: ${m.body} \`(${m.id})\``,
		)
		parts.push(`## Unread mail (${unread.length})\n\n${lines.join('\n')}`)
	}

	const cur = currentPane(ctx.env ?? process.env)

	// Owner mail — a top-level session (no spawnedBy: not a legion-spawned unit) also surfaces every
	// standing owner's unread mail, read-only, so a human roaming across sessions sees a frameless
	// agent's report inline. Among root sessions, a bound main pane gates surfacing to that one pane;
	// with no main pane bound, any root session still surfaces (the pre-onboarding fallback). Defensive:
	// any owner-side failure must never fail the harness hook.
	if (rec && !rec.spawnedBy) {
		try {
			const bound = ctx.store.getMainPane()
			if (!bound || cur?.pane === bound) {
				const standing = listAgents(ctx.store).filter((a) => a.kind === 'standing')
				for (const owner of standing) {
					const ownerUnread = inbox({ store: ctx.store }, { meId: owner.id, unread: true })
					if (ownerUnread.length === 0) continue
					const lines = ownerUnread.map(
						(m) => `- **${m.fromHandle}**${m.subject ? ` — ${m.subject}` : ''}: ${m.body} \`(${m.id})\``,
					)
					parts.push(`## Owner mail — ${owner.handle} (${ownerUnread.length})\n\n${lines.join('\n')}`)
				}
			}
		} catch {
			// owner-mail surfacing is best-effort — never let a store read error fail the harness turn
		}
	}

	// Session-start setup nudge — for a root session (no spawnedBy), prompt onboarding while
	// incomplete: in a multiplexer pane, incomplete means no main pane bound; in no pane (non-mux),
	// incomplete means no standing owner exists yet. Best-effort: never fails the harness turn.
	if (rec && !rec.spawnedBy) {
		try {
			const incomplete = cur ? !ctx.store.getMainPane() : !listAgents(ctx.store).some((a) => a.kind === 'standing')
			if (incomplete) {
				parts.push(
					'## Legion setup\n\n' +
						'This pane has no owner inbox bound yet — run `cyberlegion init` to register the surfacing ' +
						'hook and bind this pane as the owner live presence.',
				)
			}
		} catch {
			// the setup nudge is best-effort — never let a store read error fail the harness turn
		}
	}

	if (parts.length === 0) return null
	return { hookSpecificOutput: { hookEventName: event as HookEvent, additionalContext: parts.join('\n\n') } }
}
