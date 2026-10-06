import type { NudgeOptions } from 'cyber-mux'
import { resolveSpawnLaunch } from './agentdef/realize.ts'
import type { TrustOptions } from './console/trust.ts'
import { type AgentRecord, type IdContext, loadAgent, presenceOf, saveAgent } from './identity.ts'
import { type FirstTurn, ringSpawnFirstTurn, settleSpawnTrust, spawn } from './session.ts'

/** The brief a presence spawned into a standing owner's home starts from: whom it stands in for, and
 * where that owner's mail is. What to *do* with the mail is the home's agent definition's business. */
export function presenceBrief(handle: string): string {
	return [
		`You stand in for the standing owner "${handle}": you are its presence, spawned because mail was delivered to it and no unit was standing in.`,
		'',
		`Read its mail: cyberlegion mail inbox --owner ${handle}, then cyberlegion mail read --owner ${handle} <id>.`,
		`Ack what you have handled: cyberlegion mail ack --owner ${handle} <id>.`,
	].join('\n')
}

/** How the delivery doorbell's spawn into a standing owner's home came out. `existing`: a live
 * presence was found under the lock, so nothing was spawned. `spawned`: a unit was opened in the home
 * and bound; `unbound` when its trust prompt never cleared and it was released again. */
export type PresenceSpawn =
	| { kind: 'existing'; presence: AgentRecord }
	| ({ kind: 'spawned'; presence: AgentRecord; pane: string; unbound: boolean } & FirstTurn)

/**
 * Give a standing owner with a home a presence: spawn a unit in the home and bind it, unless a live
 * presence already exists — the delivery doorbell's step when mail arrives and nobody is standing in.
 *
 * Under the presence lock (the one `unit claim` takes) it re-reads the owner and decides there, so
 * two near-simultaneous deliveries spawn one unit: the second finds the first's presence live and
 * gets it back as `existing`, to ring like any presence. The lock covers the re-read, the spawn (open
 * the pane, write the record and brief), the bind, and the trust step, so no other delivery can ring
 * the new presence while its trust prompt may be showing. Only the first-turn ring runs after it is
 * released. A delivery that waits past the lock's bound takes the doorbell's lock-timeout warning;
 * its message is already in the inbox the new presence is about to read.
 *
 * The spawn opens its own workspace — never a tab or split of the sender's space, since the sender is
 * not its parent and may be in no pane — launched from the home's agent definition (resolved from the
 * home) or its harness. The home's trust prompt is accepted: a person named the folder at
 * `unit register --standing --home`. A prompt left showing anyway means the unit cannot read its
 * brief, so it is unbound again (if still the presence, before the lock is released) rather than left
 * for later deliveries to ring — a ring typed into a trust prompt answers it wrongly.
 *
 * Throws when the spawn cannot happen (no multiplexer, a missing home, an unresolvable definition, a
 * lock timeout). The doorbell turns that into a warning.
 */
export async function spawnPresence(
	ctx: IdContext,
	owner: AgentRecord,
	options: { nudgeOpts?: NudgeOptions; trustOpts?: TrustOptions } = {},
): Promise<PresenceSpawn> {
	const home = owner.home
	if (!home) throw new Error(`standing owner "${owner.handle}" has no home`)
	const outcome = await ctx.store.withLockAsync(`presence:${owner.id}`, async () => {
		const current = loadAgent(ctx.store, owner.id)
		if (!current) throw new Error(`standing owner "${owner.handle}" is gone`)
		const live = presenceOf(ctx.store, current)
		if (live) return { existing: live }
		const launched = resolveSpawnLaunch({ agent: home.agent, harness: home.harness, cwd: home.dir })
		const res = await spawn(ctx, {
			harness: launched.harness,
			command: launched.command,
			briefInstructions: launched.briefInstructions,
			task: presenceBrief(owner.handle),
			cwd: home.dir,
			cwdOwnRepo: true,
			at: 'workspace',
		})
		current.presence = res.agent.id
		saveAgent(ctx.store, current)
		// Still under the lock: no other delivery may find this presence and ring it while its trust
		// prompt may be showing — a ring typed there answers the prompt wrongly.
		// Release the presence again if this unit is still it — never a presence a `unit claim` moved on.
		const unbind = (): boolean => {
			const latest = loadAgent(ctx.store, owner.id)
			if (latest?.presence !== res.agent.id) return false
			latest.presence = undefined
			saveAgent(ctx.store, latest)
			return true
		}
		let trust: Awaited<ReturnType<typeof settleSpawnTrust>>
		try {
			trust = await settleSpawnTrust(ctx, res, { ...options, trustFolder: true })
		} catch (err) {
			// Reported like any failed spawn, so it must leave no presence behind like one.
			unbind()
			throw err
		}
		const unbound = trust.trustBlocked ? unbind() : false
		return { spawned: res, trust, unbound }
	})
	if (outcome.existing) return { kind: 'existing', presence: outcome.existing }
	const { spawned: res, trust, unbound } = outcome
	const turn = trust.trustBlocked ? trust : await ringSpawnFirstTurn(ctx, res, trust, options)
	return { kind: 'spawned', presence: res.agent, pane: res.pane, unbound, ...turn }
}
