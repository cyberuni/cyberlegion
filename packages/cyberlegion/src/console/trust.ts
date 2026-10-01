import type { MuxAdapter, MuxTarget } from 'cyber-mux'
import type { Exec, Harness } from '../identity.ts'

/**
 * One move in answering a trust prompt: press `keys` (or type `text` literally), then, when `until`
 * is set, wait for the screen to match it before the next move. A move whose `until` already
 * matches is skipped rather than repeated, which matters for a list that wraps: a second Down would
 * move the selection back off the trust option.
 */
interface TrustMove {
	keys?: string[]
	text?: string
	until?: RegExp
}

interface TrustPromptShape {
	/** The prompt is on screen when every phrase of any one of these sets is (whitespace-collapsed). */
	markers: string[][]
	/** The moves that accept it. */
	accept: TrustMove[]
}

/**
 * Each harness's folder-trust prompt, as it draws it, and the keys that accept it. Read from Claude
 * Code 2.1.286, Codex 0.153.4 (and its newer "Trust this folder?" wording), and cursor-agent
 * 2026.09.26, each opened in a real tmux pane on a folder it did not trust.
 *
 * Claude Code lists "No, exit" first and focuses it, so a bare Enter quits the harness. Its accept is
 * therefore Down, a check that the screen shows "Yes, I trust this folder" selected, and only then
 * Enter. Codex highlights its first option on `1` and confirms on Enter. cursor-agent takes `a`
 * directly.
 */
const TRUST_PROMPTS: Record<Harness, TrustPromptShape> = {
	claude: {
		markers: [['Quick safety check', 'Yes, I trust this folder']],
		accept: [{ keys: ['Down'], until: /❯\s*Yes, I trust this folder/ }, { keys: ['Enter'] }],
	},
	codex: {
		markers: [
			['Do you trust the contents of this directory?', 'Yes, continue'],
			['Trust this folder?', 'Trust and continue'],
		],
		accept: [{ text: '1', until: /›\s*1\.\s*(?:Yes, continue|Trust and continue)/ }, { keys: ['Enter'] }],
	},
	cursor: {
		markers: [['Workspace Trust Required', 'Trust this workspace']],
		accept: [{ text: 'a' }],
	},
}

const collapse = (s: string): string => s.replace(/\s+/g, ' ')

/** Whether `screen` shows `harness`'s folder-trust prompt. */
export function showsTrustPrompt(harness: Harness, screen: string): boolean {
	const flat = collapse(screen)
	return TRUST_PROMPTS[harness].markers.some((set) => set.every((phrase) => flat.includes(collapse(phrase))))
}

export interface TrustInput {
	harness: Harness
	/** The folder the harness was opened in, named in a report. */
	folder: string
	/** The unit's pane, named in a report so a person can find the prompt. */
	pane: string
	/** `accept` answers the prompt; `ask` leaves it for a person. */
	policy: 'accept' | 'ask'
}

export interface TrustOptions {
	/** Time between screen reads. */
	pollMs?: number
	/** How long to watch for the harness to show a prompt or settle without one. */
	timeoutMs?: number
	/** Equal reads in a row that count as settled. */
	stableReads?: number
	/** Blank reads in a row, from the first, after which the screen is taken as unreadable. */
	blankReads?: number
	/** Wait after the prompt appears before the first key: Claude Code ignores keys pressed right after
	 * its dialog opens. */
	keyDelayMs?: number
	/** Reads allowed for each move to take effect, and for the prompt to clear at the end. */
	attempts?: number
	sleep?: (ms: number) => Promise<void>
}

export type TrustOutcome =
	/** The harness settled on a screen with no trust prompt. */
	| { state: 'none' }
	/** The screen never settled within the timeout; there is no evidence of a prompt either way. */
	| { state: 'unsettled' }
	/** The prompt was on screen and the accept keys cleared it. */
	| { state: 'accepted' }
	/** The prompt is on screen and spawn left it for a person. */
	| { state: 'needs-human'; message: string }
	/** The accept keys were sent and the prompt is still on screen. */
	| { state: 'stuck'; message: string }

type TrustAdapter = Pick<MuxAdapter, 'read' | 'sendKeys' | 'sendText'>

/**
 * Watch a freshly-opened pane until its harness either shows its folder-trust prompt or settles on a
 * screen without one, and answer the prompt by `input.policy`.
 *
 * "Settled" means the screen has changed from its first read (the shell, still showing the launch
 * line while the harness loads) and then read the same `stableReads` times in a row. A harness that
 * never draws within the timeout, or a screen that stays blank for `blankReads` reads, is
 * `unsettled`: no evidence of a prompt, so the caller rings as it would have before. Only the screen is read; no harness config file is consulted, so what counts is
 * what the harness itself decided to show.
 */
export async function answerTrustPrompt(
	adapter: TrustAdapter,
	exec: Exec,
	target: MuxTarget,
	input: TrustInput,
	opts: TrustOptions = {},
): Promise<TrustOutcome> {
	const pollMs = opts.pollMs ?? 500
	const timeoutMs = opts.timeoutMs ?? 20_000
	const stableReads = opts.stableReads ?? 3
	const blankReads = opts.blankReads ?? 6
	const keyDelayMs = opts.keyDelayMs ?? 1_000
	const attempts = opts.attempts ?? 5
	const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))
	const read = (): string => {
		try {
			return adapter.read(exec, target).text ?? ''
		} catch {
			return ''
		}
	}
	const shown = (screen: string): boolean => showsTrustPrompt(input.harness, screen)

	const first = read()
	let seen = shown(first)
	let previous = first
	let changed = false
	let same = 1
	for (let waited = 0; !seen && waited < timeoutMs; waited += pollMs) {
		await sleep(pollMs)
		const screen = read()
		if (shown(screen)) {
			seen = true
			break
		}
		if (screen !== first) changed = true
		same = screen === previous ? same + 1 : 1
		previous = screen
		if (changed && same >= stableReads) return { state: 'none' }
		// A pane draws its shell at once, so a screen still blank by now is one the backend cannot show.
		if (!changed && first.trim() === '' && same >= blankReads) return { state: 'unsettled' }
	}
	if (!seen) return { state: 'unsettled' }

	const where = `${input.harness} in pane ${input.pane} is asking whether to trust ${input.folder}`
	if (input.policy === 'ask') {
		return {
			state: 'needs-human',
			message:
				`${where}. unit spawn does not trust a folder it did not create, so a person must answer that prompt. ` +
				'The unit is registered and its brief written; once the prompt is answered, nudge the unit to its brief.',
		}
	}

	await sleep(keyDelayMs)
	for (const move of TRUST_PROMPTS[input.harness].accept) {
		let done = move.until ? move.until.test(read()) : false
		for (let attempt = 0; !done && attempt < attempts; attempt++) {
			if (move.keys) adapter.sendKeys(exec, target, move.keys)
			if (move.text) adapter.sendText(exec, target, move.text)
			await sleep(pollMs)
			done = move.until ? move.until.test(read()) : true
		}
		if (!done) return stuck(where)
	}
	for (let attempt = 0; attempt < attempts; attempt++) {
		if (!shown(read())) return { state: 'accepted' }
		await sleep(pollMs)
	}
	return stuck(where)
}

function stuck(where: string): TrustOutcome {
	return {
		state: 'stuck',
		message: `${where}, and the prompt is still showing after spawn sent the keys that accept it. A person must answer it.`,
	}
}
