import { type InboxItem, inbox, type MsgContext } from '../message.ts'

const POLL_MS = 1000

export interface WatchInput {
	meId: string
	thread?: string
	from?: string
}

export interface WatchOptions {
	sleep?: (ms: number) => Promise<void>
	/** Bounds the loop for tests; omitted (default) runs until the process is interrupted. */
	maxIterations?: number
}

/**
 * A continuous foreground observer: prints each NEW matching message as it arrives, polling on a
 * fixed ~1s interval, until interrupted (or `maxIterations` in tests). Never acks — a message
 * `watch` prints stays unread and still surfaces later in `mail inbox`/`mail await`.
 */
export async function watchMail(
	ctx: MsgContext,
	input: WatchInput,
	onMessage: (msg: InboxItem) => void,
	opts: WatchOptions = {},
): Promise<void> {
	const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))
	const seen = new Set<string>()
	// Seed with what's already there so only messages that arrive AFTER watch starts are printed.
	for (const m of inbox(ctx, { meId: input.meId, thread: input.thread, from: input.from })) seen.add(m.id)

	let iterations = 0
	for (;;) {
		const items = inbox(ctx, { meId: input.meId, thread: input.thread, from: input.from })
		for (const m of items) {
			if (seen.has(m.id)) continue
			seen.add(m.id)
			onMessage(m)
		}
		iterations++
		if (opts.maxIterations != null && iterations >= opts.maxIterations) return
		await sleep(POLL_MS)
	}
}
