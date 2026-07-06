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
export type AgentStatus = 'spawning' | 'active' | 'idle' | 'stale' | 'exited' | 'paused'

export interface AgentRecord {
	id: string
	handle: string
	harness: Harness
	cwd: string
	worktree?: { root: string; branch?: string } | null
	tmux?: { pane: string; window?: string; session?: string } | null
	pid?: number
	status: AgentStatus
	createdAt: string
	lastSeen: string
	brief?: string
	spawnedBy?: string
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
}
