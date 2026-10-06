import { createHash } from 'node:crypto'
import type { Store as CynapseStore, Participant, SubjectId } from 'cynapse'
import type { Exec } from './identity.ts'
import type { AgentRecord, ProjectRecord, Store } from './store/store.ts'

// Registers this hub's units as cynapse participants (cynapse ADR-0013, stage 1 of #153). cynapse
// holds addresses and never measures liveness; the runtime asserts `live`/`retired` for what it
// runs, and reconciles after a crash by retiring what it registered and no longer runs.
//
// cynapse is optional (cyber-civitas decision 0001): it is an optional peer dependency, loaded
// with a dynamic import, and every entry point here is a no-op when it cannot be loaded. Only
// types are imported statically, and those are erased from the build.

const UNIT_PREFIX = 'cyberlegion:unit/'

/** This hub's own participant key. One per hub root, so reconciling one hub (a `--space`, say)
 * never retires the units another hub registered in the same cynapse store. */
export function runtimeKey(root: string): string {
	return `cyberlegion:hub/${createHash('sha256').update(root).digest('hex').slice(0, 16)}`
}

/** A unit's participant key; the participant id is UUIDv5 of it, so it is stable for the unit's life. */
export function unitKey(id: string): string {
	return `${UNIT_PREFIX}${id}`
}

/** A record that is a unit: a session, never a standing owner or a service endpoint. */
function isUnit(rec: AgentRecord): boolean {
	return rec.kind === undefined || rec.kind === 'session'
}

export interface SyncResult {
	registered: string[]
	retired: string[]
	renamed: string[]
}

/**
 * Bring cynapse's participants in line with this hub's unit records: register (or revive) every
 * unit that is not exited, rename one whose handle changed, and retire every participant this hub
 * registered whose unit is exited or gone. A stopped unit stays live — it keeps its address while
 * it has no session. Idempotent; a sync with nothing to change writes nothing.
 */
export function syncParticipants(cyn: CynapseStore, hub: Store): SyncResult {
	const result: SyncResult = { registered: [], retired: [], renamed: [] }
	const runtime = cyn.registerParticipant({ key: runtimeKey(hub.root), kind: 'service', name: 'cyberlegion' })
		.participant.id
	const mine = new Map<string, Participant>()
	for (const p of cyn.participants({ registeredBy: runtime })) {
		if (p.key?.startsWith(UNIT_PREFIX)) mine.set(p.key.slice(UNIT_PREFIX.length), p)
	}
	const units = new Map(
		hub
			.listAgents()
			.filter(isUnit)
			.map((rec) => [rec.id, rec]),
	)

	for (const rec of units.values()) {
		if (rec.status === 'exited') continue
		let p = mine.get(rec.id)
		if (!p || p.status === 'retired') {
			p = cyn.registerParticipant({
				key: unitKey(rec.id),
				kind: 'agent',
				name: rec.handle,
				registeredBy: runtime,
			}).participant
			result.registered.push(rec.id)
		}
		if (p.name !== rec.handle) {
			cyn.renameParticipant(p.id, rec.handle, runtime)
			result.renamed.push(rec.id)
		}
	}
	for (const [id, p] of mine) {
		if (p.status !== 'live') continue
		const rec = units.get(id)
		if (rec && rec.status !== 'exited') continue
		cyn.retireParticipant(p.id, runtime)
		result.retired.push(id)
	}
	return result
}

/**
 * The repository's native ID, for cynapse to key its channel by (ADR-0012). cynapse never calls a
 * store, so the runtime resolves it: the `origin` remote, through `gh`. Undefined with no origin, or
 * when `gh` is absent or cannot resolve it — cynapse then has no hosted subject for the repository.
 * The key string itself is cynapse's to build; this returns only the store and the id.
 */
export function repoSubject(exec: Exec, dir: string): SubjectId | undefined {
	const remote = exec('git', ['-C', dir, 'remote', 'get-url', 'origin'])
	if (!remote) return undefined
	const id = exec('gh', ['repo', 'view', remote, '--json', 'id', '--jq', '.id'])
	return id ? { store: 'gh', nativeId: id } : undefined
}

export interface ProjectAddress {
	subject: SubjectId
	/** The channel cynapse keys by `subject`, when someone has created it. cyberlegion owns no address
	 * channel, so it only looks this up and never creates it. */
	channel?: { id: string; handle: string }
}

/**
 * Hand a project's native ID to cynapse: resolve it once (recorded on the project) and look up the
 * channel cynapse keys by it. Undefined when cynapse is not installed — the `gh` call is skipped
 * then — or when the repository has no hosted subject.
 */
export async function projectAddress(
	hub: Store,
	project: ProjectRecord,
	exec: Exec,
	env: NodeJS.ProcessEnv = process.env,
	load: CynapseImporter = importCynapse,
): Promise<ProjectAddress | undefined> {
	let cyn: CynapseStore | undefined
	try {
		cyn = await openCynapse(env, load)
		if (!cyn) return undefined
		let subject = project.subject
		if (!subject) {
			subject = repoSubject(exec, project.root)
			if (!subject) return undefined
			hub.putProject({ ...project, subject })
		}
		const channel = cyn.getChannelBySubject(subject)
		return { subject, ...(channel ? { channel: { id: channel.id, handle: channel.handle } } : {}) }
	} catch (err) {
		console.error(`cynapse: project address skipped — ${err instanceof Error ? err.message : String(err)}`)
		return undefined
	} finally {
		cyn?.close()
	}
}

/** How the `cynapse` module is loaded; injectable so its absence can be exercised. */
export type CynapseImporter = () => Promise<{
	openStore: typeof import('cynapse').openStore
	resolveDbPath: typeof import('cynapse').resolveDbPath
}>

const importCynapse: CynapseImporter = async () => {
	// node:sqlite prints an ExperimentalWarning on Node 22 when first loaded; agents read stderr, so
	// cynapse ships a filter that has to be in place before its index loads node:sqlite.
	const { silenceSqliteWarning } = await import('cynapse/sqlite-warning')
	silenceSqliteWarning()
	return import('cynapse')
}

/**
 * Open the cynapse store this session shares with the agents it launches (`$CYNAPSE_HOME`), or
 * undefined when cynapse is not installed or cannot run here (no `node:sqlite`). Absence is the
 * runtime-only install, not a failure, so it is silent.
 */
export async function openCynapse(
	env: NodeJS.ProcessEnv = process.env,
	load: CynapseImporter = importCynapse,
): Promise<CynapseStore | undefined> {
	let mod: Awaited<ReturnType<CynapseImporter>>
	try {
		mod = await load()
	} catch {
		return undefined
	}
	return mod.openStore({ path: mod.resolveDbPath(env) })
}

/**
 * Sync this hub's units into cynapse when it is installed; a no-op when it is not. Best-effort: a
 * cynapse failure is reported on stderr and never fails the command that changed the units — the
 * next sync converges, since it reconciles the whole hub.
 */
export async function syncCynapse(
	hub: Store,
	env: NodeJS.ProcessEnv = process.env,
	load: CynapseImporter = importCynapse,
): Promise<SyncResult | undefined> {
	let cyn: CynapseStore | undefined
	try {
		cyn = await openCynapse(env, load)
		if (!cyn) return undefined
		const store = cyn
		// Held across the read of the unit records and the writes, so a concurrent spawn's record and
		// its registration never straddle another process's retire pass.
		return hub.withLock('cynapse-participants', () => syncParticipants(store, hub))
	} catch (err) {
		console.error(`cynapse: participant sync skipped — ${err instanceof Error ? err.message : String(err)}`)
		return undefined
	} finally {
		cyn?.close()
	}
}
