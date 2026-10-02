import { currentPane } from 'cyber-mux'
import { type IdContext, listAgents, loadAgent, register, resolveSelfId } from '../identity.ts'
import { inbox } from '../message.ts'
import { normalizeMuxEnv } from '../mux-env.ts'

export type HookEvent = 'SessionStart'
const EVENTS: HookEvent[] = ['SessionStart']

export interface InjectPayload {
	hookSpecificOutput: { hookEventName: HookEvent; additionalContext: string }
}

/**
 * Resolve the calling agent, gather its unread mail (and a standing owner's, when this session is
 * the hub's main pane), and return the SessionStart-style injection payload — or null when there is
 * nothing to inject (an unregistered caller or an empty inbox never fails the harness hook).
 *
 * This never injects a brief. Brief delivery is the spawn wake's job: the first-turn doorbell
 * carries the instruction and names the brief's file path, so pickup does not depend on this hook
 * firing in the child (`unit/lifecycle`, superseding ADR-0027).
 */
export function injectInbox(ctx: IdContext, event: string): InjectPayload | null {
	if (!EVENTS.includes(event as HookEvent)) {
		throw new Error(`unsupported --event "${event}" (expected ${EVENTS.join(' | ')})`)
	}
	let meId = resolveSelfId(ctx)
	if (!meId) {
		// No identity yet. If the session IS in a live multiplexer pane, self-register it here so a
		// human who never ran `unit register` still gets a first-class hub presence. Best-effort:
		// a register failure (e.g. no detectable harness) must never fail the harness turn.
		if (currentPane(normalizeMuxEnv(ctx.env ?? process.env))) {
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
	// No brief is injected here, whatever status the record carries. A spawned peer's brief reaches
	// it in the spawn wake instruction, which names the brief's file path (`unit/lifecycle`) — so the
	// brief stays on disk, unread by this hook, and a record migrated from an older hub keeps the
	// retired `spawning` status it was migrated with rather than being flipped to `active`.

	const unread = inbox({ store: ctx.store }, { meId, unread: true })
	if (unread.length > 0) {
		const lines = unread.map(
			(m) => `- **${m.fromHandle}**${m.subject ? ` — ${m.subject}` : ''}: ${m.body} \`(${m.id})\``,
		)
		parts.push(`## Unread mail (${unread.length})\n\n${lines.join('\n')}`)
	}

	const cur = currentPane(normalizeMuxEnv(ctx.env ?? process.env))

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

	if (parts.length === 0) return null
	return { hookSpecificOutput: { hookEventName: event as HookEvent, additionalContext: parts.join('\n\n') } }
}
