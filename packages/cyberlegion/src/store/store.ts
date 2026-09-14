// Domain types + the Store seam ALL mailbox + registry + brief access goes through. Pure —
// no fs/net here; `FileStore` (file-store.ts) is the current on-disk implementation, and a later
// `SqliteStore` is the sanctioned swap when FTS search, relational features, or measured
// volume/concurrency pain motivate it (identity/message/runtime code never changes).

export interface Message {
	id: string
	from: string
	fromHandle: string
	to: string
	subject?: string
	body: string
	thread?: string
	replyTo?: string
	ts: number
	sentAt: string
}

export type Harness = 'claude' | 'cursor' | 'codex'
/** The statuses this version writes. `spawning` is retired: spawn registers a peer `active`
 * outright, since nothing flips it any more (the SessionStart hook injects no brief and mutates no
 * status — see `mail/surface`). */
type AgentStatus = 'active' | 'idle' | 'stale' | 'exited' | 'paused'

export interface AgentRecord {
	id: string
	handle: string
	/** Absent for a standing record (a human/owner principal — no claude/cursor/codex harness). */
	harness?: Harness
	cwd: string
	worktree?: { root: string; branch?: string } | null
	/** Where this session lives, tagged with its multiplexer so `prune` runs the right liveness check.
	 * `null` for a session in no pane and for a standing record. `window`/`session` are tmux-only. */
	pane?: { mux: 'tmux' | 'herdr'; id: string; window?: string; session?: string } | null
	pid?: number
	/** A record migrated from an older hub (`admin migrate`) may carry a status this version no
	 * longer writes — the retired `spawning` is the known case. **Reads preserve it verbatim**: no
	 * read path validates, coerces, or normalizes a status, and none may start doing so
	 * (`mail/surface` freezes that a legacy `spawning` record keeps the status it was migrated with).
	 * A write that merely round-trips a record preserves it too.
	 *
	 * The exceptions are deliberate lifecycle writes, not normalizations: `register` asserts a session
	 * is live *now* and so writes `active`, while `prune`/`reconcile` write `exited` over whatever a
	 * record carried (`identity.ts`). A legacy record therefore does move off `spawning` — by an
	 * explicit lifecycle act, never by being read.
	 *
	 * The open member keeps the guarantee typed rather than accidental. */
	status: AgentStatus | (string & {})
	createdAt: string
	lastSeen: string
	brief?: string
	spawnedBy?: string
	/** Absent ⇒ session (backward compat, no migration). 'standing' = a session-independent,
	 * prune-exempt owner inbox minted by `unit register --standing`. 'service' = a project service's
	 * endpoint (`service.ts`): session-independent and prune-exempt like a standing record, but never
	 * surfaced as owner mail — its mailbox belongs to whichever unit currently owns the service. */
	kind?: 'session' | 'standing' | 'service'
	/** Only meaningful on a `kind: 'service'` record — which project service this endpoint is. */
	service?: { project: string; name: string }
	/** Only meaningful on a `kind: 'standing'` record — the id of the unit currently standing in for
	 * it (`unit claim`), a per-record singleton pointer that moves as the principal moves between
	 * units (last claim wins). Resolved live, never trusted: a presence unit that has exited reads as
	 * no presence bound, same as if none were ever claimed — nothing self-heals a stale pointer, it
	 * stays inert until re-claimed. Independent of the hub's `mainPane` (the human's read-pane). */
	presence?: string
}

/** A registered project: one git repository, shared by its default checkout and every linked
 * worktree of it. Keyed by its git common dir, never by a pane or a display name. */
export interface ProjectRecord {
	/** Stable reference derived from the canonical git common dir (`project.ts`). */
	id: string
	/** Display name — the default checkout's directory basename. Not unique; never a key. */
	name: string
	/** The default checkout's root. */
	root: string
	/** The canonical (realpath) git common dir the id is derived from. */
	commonDir: string
	registeredAt: string
}

/** A project service's ownership lease (`service.ts`) — who authoritatively owns the service now,
 * persisted independently of any runtime so ownership survives the runtime that held it. */
export interface ServiceLease {
	project: string
	service: string
	/** The service endpoint's record id — the durable mailbox and the stable reference. */
	endpoint: string
	/** Fencing generation: bumped on every change of authority (a new reservation or a handoff), so a
	 * runtime holding an older generation is provably stale. */
	generation: number
	/** `vacant` — no owner, no start in progress. `reserved` — a start is in progress (or failed and
	 * not yet expired). `active` — `holder` owns the service at `generation`. */
	state: 'vacant' | 'reserved' | 'active'
	holder?: string
	reservation?: { token: string; by?: string; at: string; expiresAt: string; forced?: boolean }
	updatedAt: string
}

export interface InboxSnapshot {
	unread: Message[]
	read: Message[]
}

/** The seam all mailbox + registry + brief access goes through. */
export interface Store {
	/** This store's root (for path-relative concerns the Store itself doesn't cover, e.g. spawning
	 * a worktree under a project-local root distinct from this hub). */
	readonly root: string

	/** Ensure this store's root is initialized (tracked marker present). Idempotent. */
	ensureMarker(): void

	// -- mail --
	/** Write one message into `toId`'s inbox. Collision-free by `msg.id`. */
	putMessage(toId: string, msg: Message): void
	/** The full unread/read split for one agent's inbox. */
	listInbox(id: string): InboxSnapshot
	/** Ack a message by moving it out of the unread set; throws if it is not currently unread. */
	ackMessage(id: string, msgId: string): Message
	/** Permanently remove a message (unread or already-acked) from `id`'s inbox; throws if absent. */
	removeMessage(id: string, msgId: string): void

	// -- registry --
	/** Upsert an agent record (keyed by `rec.id`). */
	putAgent(rec: AgentRecord): void
	getAgent(id: string): AgentRecord | undefined
	listAgents(): AgentRecord[]
	removeAgent(id: string): void
	removeAgentData(id: string): void

	// -- projects --
	/** Upsert a project record (keyed by `rec.id`). */
	putProject(rec: ProjectRecord): void
	getProject(id: string): ProjectRecord | undefined
	listProjects(): ProjectRecord[]

	// -- service leases --
	/** Upsert a service lease (keyed by `lease.project` + `lease.service`). Callers mutate a lease only
	 * while holding that service's named lock (`service.ts`). */
	putServiceLease(lease: ServiceLease): void
	getServiceLease(project: string, service: string): ServiceLease | undefined

	// -- pane index (multiplexer pane id -> agent id) --
	putPaneIndex(pane: string, agentId: string): void
	resolvePaneId(pane: string): string | undefined
	/** Reverse-lookup: an agent's pane from the index, when the agent record itself carries none
	 * (e.g. a herdr peer, whose pane is stored only in this index). */
	findPaneByAgentId(agentId: string): string | undefined
	removePaneIndex(pane: string): void

	// -- brief (spawn-time payload handed to a new unit) --
	writeBrief(agentId: string, text: string): void
	readBrief(agentId: string): string | undefined

	// -- main pane (hub-level owner-presence pointer) --
	/** Set (or move) the hub's single main pane — the standing owner's live presence — or clear it
	 * (`null`, a no-op when already unbound). A hub-level singleton, independent of any agent record. */
	setMainPane(pane: string | null): void
	/** The hub's currently bound main pane, or undefined when none is bound. */
	getMainPane(): string | undefined

	// -- advisory locking --
	/** Run `fn` while holding an exclusive, named advisory lock scoped to this store's root —
	 * mutual exclusion for a genuine read-modify-write (read current state, decide, write back),
	 * which an atomic single-file write alone can't make safe against a concurrent racer. Blocks
	 * until acquired or throws `LockTimeoutError` (`store/lock.ts`) after a bounded wait; never
	 * steals a lock a live holder still holds — only one abandoned by a confirmed-dead process.
	 * `setMainPane` uses this internally; callers doing their own load-mutate-save against this
	 * store (e.g. a standing record's presence rebind) should hold the SAME named lock around that
	 * whole sequence, not just around the final write. */
	withLock<T>(name: string, fn: () => T): T
}
