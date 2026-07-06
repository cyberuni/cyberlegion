import { type IdContext, loadAgent, resolveSelfId, saveAgent } from '../identity.ts'
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
	const meId = resolveSelfId(ctx)
	if (!meId) return null // unregistered caller — inject nothing, don't error the hook

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

	if (parts.length === 0) return null
	return { hookSpecificOutput: { hookEventName: event as HookEvent, additionalContext: parts.join('\n\n') } }
}
