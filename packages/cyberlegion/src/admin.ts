import type { Store } from './store/store.ts'

export interface MigrateResult {
	agents: number
	messages: number
	briefs: number
}

/**
 * Merge one store's registry + mailboxes + briefs into another (skip agent ids already present at
 * the destination). Used by `admin migrate` when moving state between an old project-local root
 * and the new global hub. Best-effort: it re-files every message into the destination's unread
 * set — the source's own read/unread split is not preserved across a migrate.
 */
export function migrateStore(from: Store, to: Store): MigrateResult {
	let agents = 0
	let messages = 0
	let briefs = 0
	to.ensureMarker()
	for (const rec of from.listAgents()) {
		if (!to.getAgent(rec.id)) {
			to.putAgent(rec)
			agents++
		}
		const snap = from.listInbox(rec.id)
		for (const msg of [...snap.unread, ...snap.read]) {
			to.putMessage(rec.id, msg)
			messages++
		}
		const brief = from.readBrief(rec.id)
		if (brief != null) {
			to.writeBrief(rec.id, brief)
			briefs++
		}
	}
	return { agents, messages, briefs }
}
