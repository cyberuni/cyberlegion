import type { MuxAdapter, MuxTarget } from 'cyber-mux'
import type { Exec } from '../identity.ts'

/**
 * What a harness's input box holds, read off a plain-text scrape of its pane.
 *
 * - `empty` — nothing typed (an idle placeholder counts as empty).
 * - `draft` — unsent text a human typed; `rows` is how many screen rows it spans.
 * - `unknown` — no input box this reader recognizes is on screen (a booting harness, a dialog, an
 *   unlisted harness). A caller treats it as it treated every screen before this reader existed.
 */
export type PromptState = { kind: 'empty' } | { kind: 'draft'; text: string; rows: number } | { kind: 'unknown' }

interface PromptShape {
	/** The input box's first row; group 1 is the text typed on it. */
	head: RegExp
	/** How a wrapped or newline-continued row is indented. */
	indent: string
	/** Whether the box is fenced by rule rows above and below (claude), rather than ended by a blank row. */
	ruled: boolean
	/** Idle placeholders the harness paints in the empty box. The scrape drops their dim styling, so they
	 * read like typed text and are told apart only by their wording. */
	placeholder: (text: string) => boolean
}

const CODEX_PLACEHOLDERS = new Set([
	'Ask Codex to do anything',
	'Explain this codebase',
	'Summarize recent commits',
	'Implement {feature}',
	'Find and fix a bug in @filename',
	'Write tests for @filename',
	'Improve documentation in @filename',
	'Run /review on my current changes',
	'Use /skills to list available skills',
])

/**
 * Each harness's input box, as probed from live sessions. Claude Code fences its box with rule rows
 * and puts a no-break space after the `❯`; Codex opens with `›` and ends at a blank row; cursor-agent
 * indents `→` by two columns and its continuation rows by four.
 */
const SHAPES: Record<string, PromptShape> = {
	claude: {
		head: /^❯(?:[  ](.*))?$/,
		indent: '  ',
		ruled: true,
		placeholder: (text) => /^Try ".*"$/.test(text),
	},
	codex: {
		head: /^›(?: (.*))?$/,
		indent: '  ',
		ruled: false,
		placeholder: (text) => CODEX_PLACEHOLDERS.has(text),
	},
	cursor: {
		head: /^ {2}→(?: (.*))?$/,
		indent: '    ',
		ruled: false,
		placeholder: (text) => text === 'Plan, search, build anything',
	},
}

/** How many non-blank rows (a footer, status and error lines) may sit below an unfenced input box —
 * cursor-agent stacks a two-row footer and then any error under it. */
const MAX_ROWS_BELOW = 6

const isRule = (row: string): boolean => /^─{3,}/.test(row)

function readShape(rows: string[], shape: PromptShape): PromptState {
	for (let at = rows.length - 1; at >= 0; at--) {
		const head = shape.head.exec(rows[at] ?? '')
		if (!head) continue
		if (shape.ruled && !isRule(rows[at - 1] ?? '')) continue
		const lines = [(head[1] ?? '').trimEnd()]
		let next = at + 1
		while (next < rows.length && (rows[next] ?? '').startsWith(shape.indent) && rows[next]?.trim()) {
			lines.push((rows[next] ?? '').slice(shape.indent.length).trimEnd())
			next++
		}
		if (shape.ruled) {
			if (!isRule(rows[next] ?? '')) continue
		} else {
			if ((rows[next] ?? '').trim() !== '' && next < rows.length) continue
			if (rows.slice(next).filter((r) => r.trim()).length > MAX_ROWS_BELOW) continue
		}
		const text = lines.join('\n')
		if (text === '' || (lines.length === 1 && shape.placeholder(text))) return { kind: 'empty' }
		return { kind: 'draft', text, rows: lines.length }
	}
	return { kind: 'unknown' }
}

/**
 * Read the input box off `screen` — a plain-text scrape of the pane — with the shape of `harness`,
 * or, when the harness is not known, with each known shape in turn until one recognizes the box.
 */
export function readPrompt(screen: string, harness?: string): PromptState {
	const rows = screen.split('\n')
	const shapes = harness && SHAPES[harness] ? [SHAPES[harness]] : Object.values(SHAPES)
	for (const shape of shapes) {
		const state = readShape(rows, shape)
		if (state.kind !== 'unknown') return state
	}
	return { kind: 'unknown' }
}

/** A draft unchanged this long means the human stepped away from it. */
export const DRAFT_IDLE_MS = 20_000
/**
 * The longest a send waits on a human who keeps editing their draft. Past it the send is abandoned
 * rather than typed over live typing: every caller's text is either durable elsewhere (mail) or a
 * command the caller can re-issue, so a skipped ring costs a later read, while an interleaved one
 * corrupts both the human's draft and ours.
 */
export const DRAFT_MAX_WAIT_MS = 60_000
const DRAFT_POLL_MS = 1_000
/** Pause between keystroke batches — cursor-agent drops keys that arrive in one burst. */
const KEY_SETTLE_MS = 150

/** Ctrl-E (end of line) then Ctrl-U (kill to start of line), typed as raw bytes so every backend
 * delivers them alike — backends disagree on key names, never on bytes. */
const END_OF_LINE = '\u0005'
const KILL_LINE = '\u0015'

export interface DraftGuardOptions {
	/** The target pane's harness, when known; picks the input-box shape to read. */
	harness?: string | undefined
	/**
	 * Recognizes text the caller itself typed earlier — a doorbell a harness put back in its input box
	 * after taking the turn. Such text is no human's draft: it is cleared at once and never typed back.
	 */
	ownText?: ((text: string) => boolean) | undefined
	idleMs?: number | undefined
	maxWaitMs?: number | undefined
	pollMs?: number | undefined
	sleep?: ((ms: number) => Promise<void>) | undefined
	now?: (() => number) | undefined
}

type Keyboard = Pick<MuxAdapter, 'read' | 'sendText'>

/**
 * Run `send` — anything that types into `target`'s input box — without trampling a human's unsent
 * draft there.
 *
 * - An empty box, or one this reader does not recognize, sends at once, exactly as before.
 * - A draft waits, polling the box: once the human sends or clears it, `send` runs untouched.
 * - A draft unchanged for `idleMs` (20s) means the human stepped away: the draft is recorded, the
 *   box cleared, `send` run, and the draft typed back — never submitted. It is typed back even when
 *   `send` throws.
 * - A draft that keeps changing past `maxWaitMs` (60s), or an idle draft spanning more than one row,
 *   throws without sending. A multi-row draft cannot be typed back exactly: a scrape cannot tell a
 *   wrapped row from a newline, and a newline typed back would submit it.
 *
 * Text `ownText` recognizes is the caller's own, not a draft: it is cleared at once, whatever rows it
 * wraps onto, `send` runs, and nothing is typed back.
 *
 * Text the clear leaves in place was never a draft — an idle placeholder this reader does not know —
 * so `send` runs and nothing is typed back.
 */
export async function withDraftGuard<T>(
	adapter: Keyboard,
	exec: Exec,
	target: MuxTarget,
	send: () => Promise<T>,
	options: DraftGuardOptions = {},
): Promise<T> {
	const idleMs = options.idleMs ?? DRAFT_IDLE_MS
	const maxWaitMs = options.maxWaitMs ?? DRAFT_MAX_WAIT_MS
	const pollMs = options.pollMs ?? DRAFT_POLL_MS
	const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))
	const now = options.now ?? Date.now
	const read = (): PromptState => {
		try {
			return readPrompt(adapter.read(exec, target).text, options.harness)
		} catch {
			return { kind: 'unknown' }
		}
	}

	const isOwn = (s: PromptState): boolean => s.kind === 'draft' && options.ownText?.(s.text) === true

	let state = read()
	const start = now()
	let changedAt = start
	while (state.kind === 'draft' && !isOwn(state) && now() - changedAt < idleMs) {
		if (now() - start + pollMs > maxWaitMs) {
			throw new Error(
				`pane ${target.id} holds a draft the user is still editing — gave up after ${maxWaitMs / 1000}s without typing`,
			)
		}
		await sleep(pollMs)
		const next = read()
		if (next.kind !== 'draft' || next.text !== state.text) changedAt = now()
		state = next
	}
	if (state.kind !== 'draft') return send()
	if (isOwn(state)) {
		await clearLine(adapter, exec, target, sleep)
		return send()
	}

	if (state.rows > 1) {
		throw new Error(
			`pane ${target.id} holds an idle draft spanning ${state.rows} rows, which cannot be typed back exactly — left it untouched`,
		)
	}
	const draft = state.text
	await clearLine(adapter, exec, target, sleep)
	const after = read()
	if (after.kind === 'draft' && after.text === draft) return send()
	try {
		return await send()
	} finally {
		await sleep(KEY_SETTLE_MS)
		adapter.sendText(exec, target, draft)
	}
}

async function clearLine(
	adapter: Keyboard,
	exec: Exec,
	target: MuxTarget,
	sleep: (ms: number) => Promise<void>,
): Promise<void> {
	adapter.sendText(exec, target, END_OF_LINE)
	await sleep(KEY_SETTLE_MS)
	adapter.sendText(exec, target, KILL_LINE)
	await sleep(KEY_SETTLE_MS)
}
