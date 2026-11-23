import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { loadAgent, resolveRecipient } from './identity.ts'
import type { AgentRecord, MailboxStore, Message, MessageOrigin, Store } from './store/store.ts'

export type { Message, MessageOrigin } from './store/store.ts'

export interface MsgContext {
	store: Store
	now?: () => number
}

export interface SendInput {
	fromId: string
	to: string
	subject?: string
	body: string
	thread?: string
	replyTo?: string
	/** The sender is blocked waiting on the recipient's answer. */
	blocked?: boolean
}

/** Snapshot where a sender is running from its record: its pane and its checkout (owned, else
 * shared). `undefined` when there is no record or it locates the sender nowhere. */
function originOf(rec: AgentRecord | undefined): MessageOrigin | undefined {
	if (!rec) return undefined
	const checkout = rec.worktree ?? rec.sharedWorktree
	const origin: MessageOrigin = {
		...(rec.pane ? { pane: rec.pane } : {}),
		...(checkout
			? {
					repo: checkout.primaryRoot ?? checkout.root,
					worktree: checkout.root,
					...(checkout.branch ? { branch: checkout.branch } : {}),
				}
			: {}),
	}
	return Object.keys(origin).length > 0 ? origin : undefined
}

/** A one-line, human-scannable origin: `<repo>@<branch>, <mux> pane <id>`, dropping what is absent;
 * empty for no origin. */
export function originLabel(origin: MessageOrigin | undefined): string {
	if (!origin) return ''
	const parts: string[] = []
	const where = origin.repo ?? origin.worktree
	if (where) parts.push(`${basename(where)}${origin.branch ? `@${origin.branch}` : ''}`)
	if (origin.pane) parts.push(`${origin.pane.mux} pane ${origin.pane.id}`)
	return parts.join(', ')
}

/** Write one message into the recipient's inbox. Collision-free by <epochMs>-<hex>. */
export function send(ctx: MsgContext, input: SendInput): Message {
	const toId = resolveRecipient(ctx.store, input.to) // throws if unknown — no partial write
	const from = loadAgent(ctx.store, input.fromId)
	const origin = originOf(from)
	const ts = ctx.now?.() ?? Date.now()
	const id = `${ts}-${randomBytes(3).toString('hex')}`
	const msg: Message = {
		id,
		from: input.fromId,
		fromHandle: from?.handle ?? input.fromId,
		to: toId,
		...(input.subject ? { subject: input.subject } : {}),
		body: input.body,
		...(input.thread ? { thread: input.thread } : {}),
		...(input.replyTo ? { replyTo: input.replyTo } : {}),
		...(origin ? { origin } : {}),
		...(input.blocked ? { blocked: true as const } : {}),
		ts,
		sentAt: new Date(ts).toISOString(),
	}
	ctx.store.putMessage(toId, msg)
	return msg
}

/** Resolve a message body from the --body flag, a --body-file path, or stdin (--body-file -). */
export function resolveBody(
	body: string | undefined,
	bodyFile: string | undefined,
	readStdin: () => string = () => readFileSync(0, 'utf8'),
): string {
	if (body != null) return body
	if (bodyFile) return bodyFile === '-' ? readStdin() : readFileSync(bodyFile, 'utf8')
	throw new Error('provide --body <text> or --body-file <path|->')
}

export interface InboxItem extends Message {
	read: boolean
}

export interface InboxQuery {
	meId: string
	unread?: boolean
	from?: string
	/** Filter to messages carrying this thread id; a message with no thread is excluded. */
	thread?: string
}

/** List the caller's mail, chronological (lexical id sort == time order). */
export function inbox(ctx: MsgContext, q: InboxQuery): InboxItem[] {
	const snap = ctx.store.listInbox(q.meId)
	const unread = snap.unread.map((m) => ({ ...m, read: false }))
	const acked = q.unread ? [] : snap.read.map((m) => ({ ...m, read: true }))
	let items = [...unread, ...acked]
	if (q.from) items = items.filter((m) => m.from === q.from || m.fromHandle === q.from)
	if (q.thread) items = items.filter((m) => m.thread === q.thread)
	return items.sort((a, b) => a.id.localeCompare(b.id))
}

/** Whether a unit's mailbox exists and could be read. `none` means mail was never delivered to it;
 * `present` means it was read (its listing may be empty); `unreadable` means its directory or one of
 * its messages could not be read, so whether it holds unread mail is unknown. */
type MailboxState = 'none' | 'present' | 'unreadable'

export interface UnitInbox {
	mailbox: MailboxState
	messages: InboxItem[]
	/** Why the mailbox is `unreadable`. */
	error?: string
}

/** List another unit's mail read-only, for a caller deciding about that unit (a cleanup sweep): never
 * acks, and reports a missing or unreadable mailbox as its own state rather than as an empty one. */
export function unitInbox(ctx: MsgContext, q: InboxQuery): UnitInbox {
	if (!ctx.store.hasMailbox(q.meId)) return { mailbox: 'none', messages: [] }
	try {
		return { mailbox: 'present', messages: inbox(ctx, q) }
	} catch (err) {
		return { mailbox: 'unreadable', messages: [], error: err instanceof Error ? err.message : String(err) }
	}
}

/** Peek at a message (unread or already-acked) without changing its state. */
export function peek(ctx: MsgContext, meId: string, msgId: string): Message | undefined {
	const snap = ctx.store.listInbox(meId)
	return [...snap.unread, ...snap.read].find((m) => m.id === msgId)
}

/** Acknowledge a message by moving it out of the unread set. Errors if not currently unread. */
export function ack(ctx: MsgContext, meId: string, msgId: string): Message {
	return ctx.store.ackMessage(meId, msgId)
}

/** Read and consume a message in one atomic step: returns the body and acks it if still unread.
 * Idempotent — an already-acked message is returned with `acked: false` rather than erroring (unlike
 * bare `ack`); an unknown message id throws. Backs `mail read --ack`. */
export function readAck(ctx: MsgContext, meId: string, msgId: string): { msg: Message; acked: boolean } {
	const snap = ctx.store.listInbox(meId)
	if (snap.unread.some((m) => m.id === msgId)) {
		return { msg: ctx.store.ackMessage(meId, msgId), acked: true }
	}
	const already = snap.read.find((m) => m.id === msgId)
	if (already) return { msg: already, acked: false }
	throw new Error(`"${msgId}" is not a message in this inbox`)
}

/** Permanently remove a message (unread or already-acked) from the caller's inbox. */
export function deleteMessage(ctx: MsgContext, meId: string, msgId: string): void {
	ctx.store.removeMessage(meId, msgId)
}

/** Delete an address's whole mailbox, read and unread — for an address going away for good (`unit
 * close`). The caller names the address; where and how its mail is stored stays this side's concern. */
export function deleteMailbox(store: MailboxStore, id: string): void {
	store.removeMailbox(id)
}
