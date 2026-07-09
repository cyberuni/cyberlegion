// Domain types + the Store seam ALL mailbox + registry + brief/result access goes through. Pure —
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
type AgentStatus = 'spawning' | 'active' | 'idle' | 'stale' | 'exited' | 'paused'

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
	status: AgentStatus
	createdAt: string
	lastSeen: string
	brief?: string
	spawnedBy?: string
	/** Absent ⇒ session (backward compat, no migration). 'standing' = a session-independent,
	 * prune-exempt owner inbox minted by `identity owner`. */
	kind?: 'session' | 'standing'
}

export interface InboxSnapshot {
	unread: Message[]
	read: Message[]
}

/** The seam all mailbox + registry + brief/result access goes through. */
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

	// -- result (dispatch result slot — the subagent path's file counterpart to mail's thread await) --
	/** Path this dispatch's result file would live at (computed only — no IO; existence not implied). */
	resultPath(id: string): string
	/** Write a dispatch's result as JSON text. */
	writeResult(id: string, value: unknown): void
	/** Read a dispatch's result JSON text, or undefined if not yet written. */
	readResult(id: string): string | undefined

	// -- main pane (hub-level owner-presence pointer) --
	/** Set (or move) the hub's single main pane — the standing owner's live presence — or clear it
	 * (`null`, a no-op when already unbound). A hub-level singleton, independent of any agent record. */
	setMainPane(pane: string | null): void
	/** The hub's currently bound main pane, or undefined when none is bound. */
	getMainPane(): string | undefined
}
