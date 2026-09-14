import { randomBytes } from 'node:crypto'
import { type AgentRecord, type IdContext, loadAgent, saveAgent, sessionLive } from './identity.ts'
import { type ProjectRecord, resolveProject } from './project.ts'
import type { ServiceLease } from './store/store.ts'

export type { ServiceLease } from './store/store.ts'

// A project service: one named role inside a registered project that exactly one unit owns at a
// time. The service has two parts that deliberately live apart:
//
// - the ENDPOINT — a session-independent record whose mailbox and id are the service's stable
//   reference, surviving every runtime that ever owns it;
// - the LEASE — who owns the service now, at which fencing generation.
//
// Ownership changes only under the service's named lock, and every change of authority bumps the
// generation. Starting a runtime takes far longer than a lock may be held, so resolve-or-start is two
// steps: `acquireService` either resolves a healthy owner or leaves a time-bounded reservation, and
// `bindService` turns that reservation into ownership once the runtime exists. A caller that loses
// the race sees `starting`, never a second reservation; a start that dies leaves a reservation that
// expires (or is released) rather than a second authoritative runtime.

export interface ServiceContext extends IdContext {
	/** Whether a unit's session is still there. Defaults to asking its multiplexer (`sessionLive`). */
	isLive?: (unit: AgentRecord) => boolean
}

export type ServiceHealth = 'vacant' | 'starting' | 'expired' | 'healthy' | 'unhealthy'

export interface ServiceView {
	project: ProjectRecord
	endpoint: AgentRecord
	lease: ServiceLease
	/** The owning unit's record, when the lease is active and the record still exists. */
	owner?: AgentRecord
	health: ServiceHealth
	/** Whether the owner's session can be controlled (focused, nudged, read) — `pane` when it has a
	 * multiplexer pane, `none` otherwise. Resolving the address never implies control. */
	control: 'pane' | 'none'
	/** A human-readable qualification of `health`/`control`, when there is one. */
	note?: string
}

export type AcquireResult =
	| { outcome: 'resolved'; lease: ServiceLease; view: ServiceView }
	| { outcome: 'starting'; lease: ServiceLease; view: ServiceView }
	| { outcome: 'reserved'; lease: ServiceLease; view: ServiceView; token: string }

export type OwnershipErrorCode = 'stale' | 'unit-not-live' | 'unknown-unit'

/** A refused ownership transition. `stale` means the caller's generation, token, or holder claim is
 * not the current one — the caller is not (or no longer) the authority it claims to be. */
export class ServiceOwnershipError extends Error {
	constructor(
		public readonly code: OwnershipErrorCode,
		message: string,
	) {
		super(message)
		this.name = 'ServiceOwnershipError'
	}
}

/** How long a reservation holds before another caller may take over a start that never bound. */
export const DEFAULT_RESERVATION_TTL_MS = 5 * 60_000

const SERVICE_NAME = /^[a-z0-9][a-z0-9_-]{0,62}$/

function assertServiceName(name: string): void {
	if (!SERVICE_NAME.test(name)) {
		throw new Error(`invalid service name "${name}" — use lowercase letters, digits, "-" or "_" (max 63)`)
	}
}

export function serviceEndpointId(projectId: string, name: string): string {
	return `svc-${projectId}-${name}`
}

const nowMs = (ctx: ServiceContext) => ctx.now?.() ?? Date.now()
const iso = (ms: number) => new Date(ms).toISOString()

function lockName(projectId: string, name: string): string {
	return `service-${projectId}-${name}`
}

function isLive(ctx: ServiceContext, unit: AgentRecord): boolean {
	if (unit.status === 'exited') return false
	return ctx.isLive ? ctx.isLive(unit) : sessionLive(ctx, unit)
}

function ensureEndpoint(ctx: ServiceContext, project: ProjectRecord, name: string): AgentRecord {
	const id = serviceEndpointId(project.id, name)
	const existing = loadAgent(ctx.store, id)
	if (existing) return existing
	ctx.store.ensureMarker()
	const ts = iso(nowMs(ctx))
	const rec: AgentRecord = {
		id,
		handle: `${name}@${project.name}`,
		kind: 'service',
		service: { project: project.id, name },
		cwd: project.root,
		pane: null,
		status: 'active',
		createdAt: ts,
		lastSeen: ts,
	}
	saveAgent(ctx.store, rec)
	return rec
}

function view(ctx: ServiceContext, project: ProjectRecord, endpoint: AgentRecord, lease: ServiceLease): ServiceView {
	const base = { project, endpoint, lease }
	if (lease.state === 'vacant') return { ...base, health: 'vacant', control: 'none' }
	if (lease.state === 'reserved') {
		const expired = nowMs(ctx) > Date.parse(lease.reservation?.expiresAt ?? '')
		return {
			...base,
			health: expired ? 'expired' : 'starting',
			control: 'none',
			...(expired ? { note: 'the reservation expired without a bound owner; the next acquire takes over' } : {}),
		}
	}
	const owner = lease.holder ? loadAgent(ctx.store, lease.holder) : undefined
	if (!owner) return { ...base, health: 'unhealthy', control: 'none', note: 'the owner has no unit record' }
	const control = owner.pane || ctx.store.findPaneByAgentId(owner.id) ? 'pane' : 'none'
	const controlNote =
		control === 'none'
			? 'the owner resolves, but its session control is not recoverable from here (no multiplexer pane — e.g. a native subagent only its parent can drive)'
			: undefined
	if (!isLive(ctx, owner)) {
		return { ...base, owner, health: 'unhealthy', control, note: 'the owner session is gone' }
	}
	return { ...base, owner, health: 'healthy', control, ...(controlNote ? { note: controlNote } : {}) }
}

function vacantLease(ctx: ServiceContext, projectId: string, name: string): ServiceLease {
	return {
		project: projectId,
		service: name,
		endpoint: serviceEndpointId(projectId, name),
		generation: 0,
		state: 'vacant',
		updatedAt: iso(nowMs(ctx)),
	}
}

/** Load the project, service endpoint, and lease — creating the endpoint and a vacant lease when
 * `create` is set, else throwing for a service that was never started. */
function load(
	ctx: ServiceContext,
	projectRef: string,
	name: string,
	create: boolean,
): { project: ProjectRecord; endpoint: AgentRecord; lease: ServiceLease } {
	assertServiceName(name)
	const project = resolveProject(ctx, projectRef)
	const lease = ctx.store.getServiceLease(project.id, name)
	const endpoint = loadAgent(ctx.store, serviceEndpointId(project.id, name))
	if (lease && endpoint) return { project, endpoint, lease }
	if (!create) throw new Error(`no service "${name}" in project ${project.name} (${project.id})`)
	return { project, endpoint: ensureEndpoint(ctx, project, name), lease: lease ?? vacantLease(ctx, project.id, name) }
}

/** Run `fn` on the service's current state under its lock — every ownership transition goes here. */
function transition<T>(
	ctx: ServiceContext,
	projectRef: string,
	name: string,
	create: boolean,
	fn: (s: { project: ProjectRecord; endpoint: AgentRecord; lease: ServiceLease }) => T,
): T {
	assertServiceName(name)
	const project = resolveProject(ctx, projectRef)
	return ctx.store.withLock(lockName(project.id, name), () => fn(load(ctx, project.id, name, create)))
}

function write(ctx: ServiceContext, lease: ServiceLease): ServiceLease {
	const next = { ...lease, updatedAt: iso(nowMs(ctx)) }
	ctx.store.putServiceLease(next)
	return next
}

function stale(message: string): ServiceOwnershipError {
	return new ServiceOwnershipError('stale', message)
}

/** Read a service's ownership without changing anything. Throws for a service never started. */
export function resolveService(ctx: ServiceContext, projectRef: string, name: string): ServiceView {
	const { project, endpoint, lease } = load(ctx, projectRef, name, false)
	return view(ctx, project, endpoint, lease)
}

export interface AcquireInput {
	/** Who is starting the service — recorded on the reservation for diagnosis. */
	by?: string
	ttlMs?: number
	/** Replace even a healthy owner or an unexpired reservation. Must name the current generation, so
	 * a force decided on a stale read fails instead of displacing an owner the caller never saw. */
	force?: { generation: number }
}

/**
 * Contact-or-start: resolve the service's healthy owner, or reserve the right to start one. Exactly
 * one of any number of concurrent callers gets `reserved`; the rest see `starting` (a start is in
 * progress) or `resolved`. A vacant service, an unhealthy owner, and an expired reservation are all
 * reservable, each under a new generation that fences out whatever held the old one.
 */
export function acquireService(
	ctx: ServiceContext,
	projectRef: string,
	name: string,
	input: AcquireInput = {},
): AcquireResult {
	return transition(ctx, projectRef, name, true, ({ project, endpoint, lease }) => {
		const current = view(ctx, project, endpoint, lease)
		if (input.force) {
			if (input.force.generation !== lease.generation) {
				throw stale(`cannot force: generation ${input.force.generation} is not the current ${lease.generation}`)
			}
		} else if (current.health === 'healthy') {
			return { outcome: 'resolved', lease, view: current }
		} else if (current.health === 'starting') {
			return { outcome: 'starting', lease, view: current }
		}
		const now = nowMs(ctx)
		const token = randomBytes(8).toString('hex')
		const next = write(ctx, {
			project: project.id,
			service: name,
			endpoint: endpoint.id,
			generation: lease.generation + 1,
			state: 'reserved',
			reservation: {
				token,
				...(input.by ? { by: input.by } : {}),
				at: iso(now),
				expiresAt: iso(now + (input.ttlMs ?? DEFAULT_RESERVATION_TTL_MS)),
				...(input.force ? { forced: true } : {}),
			},
			updatedAt: iso(now),
		})
		return { outcome: 'reserved', lease: next, view: view(ctx, project, endpoint, next), token }
	})
}

function liveUnit(ctx: ServiceContext, id: string): AgentRecord {
	const unit = loadAgent(ctx.store, id)
	if (!unit) throw new ServiceOwnershipError('unknown-unit', `no unit "${id}"`)
	if (!isLive(ctx, unit)) throw new ServiceOwnershipError('unit-not-live', `unit "${id}" has no live session`)
	return unit
}

/**
 * Complete a reservation: make `unit` the owner at the reserved generation. Refused when the
 * reservation is no longer the current one (it expired and someone else re-reserved, or it was
 * released) — the starter then holds a runtime that is not the authority and must stop it. A
 * reservation that expired with nobody taking over is still bindable: nothing replaced it.
 */
export function bindService(
	ctx: ServiceContext,
	projectRef: string,
	name: string,
	input: { generation: number; token: string; unit: string },
): ServiceView {
	return transition(ctx, projectRef, name, false, ({ project, endpoint, lease }) => {
		if (
			lease.state !== 'reserved' ||
			lease.generation !== input.generation ||
			lease.reservation?.token !== input.token
		) {
			throw stale(
				`reservation for generation ${input.generation} is no longer current (now ${lease.state} at ${lease.generation})`,
			)
		}
		liveUnit(ctx, input.unit)
		const next = write(ctx, {
			project: lease.project,
			service: lease.service,
			endpoint: lease.endpoint,
			generation: lease.generation,
			state: 'active',
			holder: input.unit,
			updatedAt: lease.updatedAt,
		})
		return view(ctx, project, endpoint, next)
	})
}

/**
 * Give the service up: abandon a reservation (a failed start — pass its `token`) or step down as
 * owner (pass the holder `unit`). Either must match the current generation. The generation is kept;
 * the next acquire bumps it.
 */
export function releaseService(
	ctx: ServiceContext,
	projectRef: string,
	name: string,
	input: { generation: number; token?: string; unit?: string },
): ServiceView {
	return transition(ctx, projectRef, name, false, ({ project, endpoint, lease }) => {
		const matches =
			lease.generation === input.generation &&
			((lease.state === 'reserved' && input.token !== undefined && lease.reservation?.token === input.token) ||
				(lease.state === 'active' && input.unit !== undefined && lease.holder === input.unit))
		if (!matches)
			throw stale(`nothing to release at generation ${input.generation} (now ${lease.state} at ${lease.generation})`)
		const next = write(ctx, {
			project: lease.project,
			service: lease.service,
			endpoint: lease.endpoint,
			generation: lease.generation,
			state: 'vacant',
			updatedAt: lease.updatedAt,
		})
		return view(ctx, project, endpoint, next)
	})
}

/**
 * Transfer ownership from the current holder to another live unit, under a new generation. Only the
 * holder at the current generation can hand off, and afterwards it is stale.
 */
export function handoffService(
	ctx: ServiceContext,
	projectRef: string,
	name: string,
	input: { generation: number; from: string; to: string },
): ServiceView {
	return transition(ctx, projectRef, name, false, ({ project, endpoint, lease }) => {
		if (lease.state !== 'active' || lease.generation !== input.generation || lease.holder !== input.from) {
			throw stale(`"${input.from}" is not the owner at generation ${input.generation}`)
		}
		liveUnit(ctx, input.to)
		const next = write(ctx, { ...lease, generation: lease.generation + 1, holder: input.to })
		return view(ctx, project, endpoint, next)
	})
}

/**
 * The fencing check: succeed only when `unit` owns the service at exactly `generation`. A runtime
 * calls this before acting as the service's authority; a stale runtime — replaced, handed off, or
 * recovered past — is refused.
 */
export function verifyOwnership(
	ctx: ServiceContext,
	projectRef: string,
	name: string,
	input: { unit: string; generation: number },
): ServiceView {
	const { project, endpoint, lease } = load(ctx, projectRef, name, false)
	if (lease.state !== 'active' || lease.holder !== input.unit || lease.generation !== input.generation) {
		throw stale(
			`"${input.unit}" at generation ${input.generation} is not the owner (now ${lease.state}` +
				`${lease.holder ? ` by ${lease.holder}` : ''} at ${lease.generation})`,
		)
	}
	return view(ctx, project, endpoint, lease)
}

/**
 * Run `fn` as the verified owner, holding the service lock so no transition can interleave between
 * the check and the act. For short critical sections only — the lock is bounded-wait for everyone
 * else — and never reentrant: `fn` must not call another service transition on the same service.
 */
export function withOwnership<T>(
	ctx: ServiceContext,
	projectRef: string,
	name: string,
	input: { unit: string; generation: number },
	fn: (view: ServiceView) => T,
): T {
	assertServiceName(name)
	const project = resolveProject(ctx, projectRef)
	return ctx.store.withLock(lockName(project.id, name), () => fn(verifyOwnership(ctx, project.id, name, input)))
}
