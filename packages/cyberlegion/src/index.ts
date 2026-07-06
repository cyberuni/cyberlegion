// cyberlegion — public library façade.
//
// A curated, in-repo API surface for a workspace sibling (cyberfleet) that builds on the
// cyberlegion mechanism as TS code rather than shelling out to the CLI. The CLI (bin) remains the
// contract for SDD, agents, and any external consumer — only a monorepo sibling imports this.
// Keep this narrow and intentional: the domain types + Store seam + the reusable operations, never
// internal helpers.

export { realizeLaunch, realizeSubagentInstruction } from './agentdef/realize.ts'
// ── Agent definitions ──────────────────────────────────────────────────────────────────────────
export type { AgentDef } from './agentdef/resolve.ts'
export { listAgentDefs, resolveAgentDef } from './agentdef/resolve.ts'
export { selectSessionAdapter } from './console/index.ts'
// ── Wake ───────────────────────────────────────────────────────────────────────────────────────
export type { MuxProbe } from './console/mux-probe.ts'
export { probeMultiplexer } from './console/mux-probe.ts'
export { assertDistinctFromPrimary, gitWorktreeAdapter, resolvePrimaryRoot } from './console/worktree.ts'
export type { DecommissionInput, DecommissionResult } from './decommission.ts'
export { decommission } from './decommission.ts'
export type { ChannelInput, DispatchResult } from './dispatch/channel.ts'
export { channel, DispatchWaitingError } from './dispatch/channel.ts'
export { collect } from './dispatch/collect.ts'
// ── Dispatch ───────────────────────────────────────────────────────────────────────────────────
export type { DispatchEnvelope, PrepInput } from './dispatch/prep.ts'
export { prep } from './dispatch/prep.ts'
// ── Identity + registry ────────────────────────────────────────────────────────────────────────
export type { Exec, IdContext, RegisterInput } from './identity.ts'
export {
	bumpLastSeen,
	detectHarness,
	listAgents,
	loadAgent,
	prune,
	realExec,
	register,
	resolveAgent,
	resolveRecipient,
	resolveSelfId,
	touch,
} from './identity.ts'
export { install } from './install.ts'
// ── Mail ───────────────────────────────────────────────────────────────────────────────────────
export type { InboxItem, InboxQuery, SendInput } from './message.ts'
export { ack, deleteMessage, inbox, peek, resolveBody, send } from './message.ts'
// ── AXI output helpers (so a sibling emits the same TOON/next-step contract) ─────────────────────
export type { Format } from './output.ts'
export { emit, fail, nextStep, toonList, toonObject } from './output.ts'
// ── Paths + the hub ────────────────────────────────────────────────────────────────────────────
export type { RootOptions } from './paths.ts'
export { ensureMarker, paths, projectRoot, resolveProjectLocalRoot, resolveRoot } from './paths.ts'
// ── Surfacing + install (hooks) ────────────────────────────────────────────────────────────────
export type { HookEvent } from './runtime/inject-inbox.ts'
export { injectInbox } from './runtime/inject-inbox.ts'
// ── Session lifecycle (channel) ────────────────────────────────────────────────────────────────
export type { SpawnInput, SpawnResult } from './session.ts'
export { spawn } from './session.ts'
export { FileStore } from './store/file-store.ts'
// ── Domain + the Store seam ────────────────────────────────────────────────────────────────────
export type { AgentRecord, Harness, InboxSnapshot, Message, Store } from './store/store.ts'
export type { AwaitInput, AwaitOutcome } from './wake/await.ts'
export { awaitReply } from './wake/await.ts'
export type { WakePathInput, WakePathResult } from './wake/wake-path.ts'
export { selectWakePath } from './wake/wake-path.ts'
export { watchMail } from './wake/watch.ts'
