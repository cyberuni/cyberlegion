import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { loadAgent, resolveRecipient } from './identity.ts'
import type { Message, Store } from './store/store.ts'

export type { Message } from './store/store.ts'

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
}

/** Write one message into the recipient's inbox. Collision-free by <epochMs>-<hex>. */
export function send(ctx: MsgContext, input: SendInput): Message {
	const toId = resolveRecipient(ctx.store, input.to) // throws if unknown — no partial write
	const from = loadAgent(ctx.store, input.fromId)
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

/** Peek at a message (unread or already-acked) without changing its state. */
export function peek(ctx: MsgContext, meId: string, msgId: string): Message | undefined {
	const snap = ctx.store.listInbox(meId)
	return [...snap.unread, ...snap.read].find((m) => m.id === msgId)
}

/** Acknowledge a message by moving it out of the unread set. Errors if not currently unread. */
export function ack(ctx: MsgContext, meId: string, msgId: string): Message {
	return ctx.store.ackMessage(meId, msgId)
}

/** Permanently remove a message (unread or already-acked) from the caller's inbox. */
export function deleteMessage(ctx: MsgContext, meId: string, msgId: string): void {
	ctx.store.removeMessage(meId, msgId)
}
