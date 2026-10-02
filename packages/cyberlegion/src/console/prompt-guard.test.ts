import type { MuxAdapter } from 'cyber-mux'
import { describe, expect, it } from 'vitest'
import { DRAFT_IDLE_MS, DRAFT_MAX_WAIT_MS, readPrompt, withDraftGuard } from './prompt-guard.ts'

// Screens below are trimmed captures of each harness's live input box (claude 2.1, codex, cursor-agent
// 2026.09), read through a plain-text pane scrape — the placeholder is dim-styled on screen, but the
// scrape drops styling, so it reads exactly like typed text.

const RULE = '─'.repeat(60)
const claude = (...rows: string[]) =>
	['● earlier reply', '', RULE, ...rows, RULE, '  Opus 5.5  legion-113bcb  $0.00', '  ⏵⏵ auto mode on'].join('\n')
const codex = (...rows: string[]) =>
	['• earlier reply', '', '', ...rows, '', '  gpt-6 high · legion-113bcb · Context 0% used', '', ''].join('\n')
const cursor = (...rows: string[]) =>
	['  Cursor Agent', '', ...rows, '', '', '  GPT-5.2 Medium', '  ~/code/x · main', '', ''].join('\n')

describe('readPrompt', () => {
	it('reads an empty claude prompt showing its placeholder as empty', () => {
		expect(readPrompt(claude('❯ Try "how does doorbell.test.ts work?"'), 'claude')).toEqual({ kind: 'empty' })
	})

	it('reads a claude draft', () => {
		expect(readPrompt(claude('❯ hello draft'), 'claude')).toEqual({ kind: 'draft', text: 'hello draft', rows: 1 })
	})

	it('counts a claude draft spanning several rows', () => {
		expect(readPrompt(claude('❯ line one', '  line two'), 'claude')).toEqual({
			kind: 'draft',
			text: 'line one\nline two',
			rows: 2,
		})
	})

	it('does not mistake a claude transcript message for the input box', () => {
		// a permission dialog hides the input box; the last ❯ row is then a past user message
		const screen = ['❯ run the tests', '● Bash(pnpm test)', '  Do you want to proceed?', '  ❯ 1. Yes'].join('\n')
		expect(readPrompt(screen, 'claude')).toEqual({ kind: 'unknown' })
	})

	it('reads codex empty, placeholder, and draft prompts', () => {
		expect(readPrompt(codex('› Ask Codex to do anything'), 'codex')).toEqual({ kind: 'empty' })
		expect(readPrompt(codex('›'), 'codex')).toEqual({ kind: 'empty' })
		expect(readPrompt(codex('› hello draft'), 'codex')).toEqual({ kind: 'draft', text: 'hello draft', rows: 1 })
		expect(readPrompt(codex('› line one', '  line two'), 'codex')).toEqual({
			kind: 'draft',
			text: 'line one\nline two',
			rows: 2,
		})
	})

	it('reads cursor empty, placeholder, and draft prompts', () => {
		expect(readPrompt(cursor('  → Plan, search, build anything'), 'cursor')).toEqual({ kind: 'empty' })
		expect(readPrompt(cursor('  → hello draft'), 'cursor')).toEqual({ kind: 'draft', text: 'hello draft', rows: 1 })
		expect(readPrompt(cursor('  → line one', '    line two'), 'cursor')).toEqual({
			kind: 'draft',
			text: 'line one\nline two',
			rows: 2,
		})
	})

	it('reads a cursor draft under queued follow-ups and above an error footer', () => {
		const screen = [
			' ┌─ follow-ups ──────',
			' │ ○ Reply with just the word OK.',
			' │ ↑ to edit',
			' └───────────────────',
			'',
			'  → my unsent draft text',
			'',
			'',
			'  GPT-5.2 Medium',
			'  ~/code/x · main',
			'',
			'  Error: Authentication error',
			'  If you are logged in, try logging out and back in.',
		].join('\n')
		expect(readPrompt(screen, 'cursor')).toEqual({ kind: 'draft', text: 'my unsent draft text', rows: 1 })
	})

	it('tries every known harness when the target harness is not known', () => {
		expect(readPrompt(codex('› hello draft'))).toEqual({ kind: 'draft', text: 'hello draft', rows: 1 })
		expect(readPrompt(claude('❯ hi'))).toEqual({ kind: 'draft', text: 'hi', rows: 1 })
	})

	it('reports a screen with no recognizable input box as unknown', () => {
		expect(readPrompt('booting…\n', 'claude')).toEqual({ kind: 'unknown' })
		expect(readPrompt('> staged doorbell')).toEqual({ kind: 'unknown' })
		expect(readPrompt('', 'codex')).toEqual({ kind: 'unknown' })
	})
})

/**
 * A pane whose screen is a function of the fake clock — `screens` maps a start time (ms) to the
 * screen shown from then on — plus a log of every keystroke the guard types. Typing ctrl-e/ctrl-u
 * (the clear) switches the screen to `afterClear` when given.
 */
function fakePane(screens: [number, string][], afterClear?: string) {
	let now = 0
	let cleared = false
	const typed: string[] = []
	const adapter = {
		read: () => {
			if (cleared && afterClear !== undefined) return { text: afterClear }
			const shown = screens.filter(([at]) => at <= now).at(-1)
			return { text: shown?.[1] ?? '' }
		},
		sendText: (_exec: unknown, _t: unknown, text: string) => {
			typed.push(text)
			if (text === '\u0015') cleared = true
		},
	} as unknown as MuxAdapter
	const clock = {
		now: () => now,
		sleep: async (ms: number) => {
			now += ms
		},
	}
	return { adapter, typed, clock, elapsed: () => now }
}

const exec = () => null
const target = { id: '%1' }

// spec: prompt-guard/prompt-guard.feature
describe('spec:cyberlegion/prompt-guard withDraftGuard', () => {
	it('sends at once when the input box is empty', async () => {
		const pane = fakePane([[0, claude('❯ Try "x"')]])
		const sent: string[] = []
		await withDraftGuard(pane.adapter, exec, target, async () => sent.push('ring'), {
			harness: 'claude',
			...pane.clock,
		})
		expect(sent).toEqual(['ring'])
		expect(pane.typed).toEqual([])
		expect(pane.elapsed()).toBe(0)
	})

	it('sends at once when no input box is recognized', async () => {
		const pane = fakePane([[0, 'booting…']])
		const sent: string[] = []
		await withDraftGuard(pane.adapter, exec, target, async () => sent.push('ring'), pane.clock)
		expect(sent).toEqual(['ring'])
		expect(pane.typed).toEqual([])
	})

	it('waits for the human to send their draft, then sends without touching the box', async () => {
		const pane = fakePane([
			[0, claude('❯ hello')],
			[3000, claude('❯ hello wor')],
			[5000, claude('❯ ')],
		])
		const sent: number[] = []
		await withDraftGuard(pane.adapter, exec, target, async () => sent.push(pane.elapsed()), {
			harness: 'claude',
			...pane.clock,
		})
		expect(sent).toEqual([5000])
		expect(pane.typed).toEqual([])
	})

	it('when a draft sits unchanged for 20s, clears it, sends, then types the draft back unsent', async () => {
		const pane = fakePane([[0, claude('❯ half a thought')]], claude('❯ '))
		const order: string[] = []
		await withDraftGuard(
			pane.adapter,
			exec,
			target,
			async () => {
				order.push(`send@${pane.elapsed() >= DRAFT_IDLE_MS ? 'idle' : 'early'}:${pane.typed.length}`)
			},
			{ harness: 'claude', ...pane.clock },
		)
		expect(order).toEqual(['send@idle:2'])
		expect(pane.typed).toEqual(['\u0005', '\u0015', 'half a thought'])
	})

	it('restarts the 20s idle clock every time the draft changes', async () => {
		const pane = fakePane(
			[
				[0, claude('❯ a')],
				[15000, claude('❯ ab')],
			],
			claude('❯ '),
		)
		let sentAt = -1
		await withDraftGuard(
			pane.adapter,
			exec,
			target,
			async () => {
				sentAt = pane.elapsed()
			},
			{ harness: 'claude', ...pane.clock },
		)
		expect(sentAt).toBeGreaterThanOrEqual(35000)
		expect(pane.typed.at(-1)).toBe('ab')
	})

	it('gives up without sending when the draft keeps changing past the overall bound', async () => {
		const screens: [number, string][] = []
		for (let t = 0; t <= 200000; t += 5000) screens.push([t, claude(`❯ typing ${t}`)])
		const pane = fakePane(screens)
		const sent: string[] = []
		await expect(
			withDraftGuard(pane.adapter, exec, target, async () => sent.push('ring'), { harness: 'claude', ...pane.clock }),
		).rejects.toThrow(/draft/)
		expect(sent).toEqual([])
		expect(pane.typed).toEqual([])
		expect(pane.elapsed()).toBeLessThanOrEqual(DRAFT_MAX_WAIT_MS)
	})

	it('leaves an idle multi-row draft alone and does not send, since it cannot be typed back exactly', async () => {
		const pane = fakePane([[0, claude('❯ line one', '  line two')]])
		const sent: string[] = []
		await expect(
			withDraftGuard(pane.adapter, exec, target, async () => sent.push('ring'), { harness: 'claude', ...pane.clock }),
		).rejects.toThrow(/row/)
		expect(sent).toEqual([])
		expect(pane.typed).toEqual([])
	})

	it('treats text the clear could not remove as a placeholder: sends, and types nothing back', async () => {
		const pane = fakePane([[0, codex('› Some new placeholder')]])
		const sent: string[] = []
		await withDraftGuard(pane.adapter, exec, target, async () => sent.push('ring'), { harness: 'codex', ...pane.clock })
		expect(sent).toEqual(['ring'])
		expect(pane.typed).toEqual(['\u0005', '\u0015'])
	})

	it('clears text the caller owns at once, sends, and types nothing back', async () => {
		const ring = 'You have unread mail — check your inbox.'
		const pane = fakePane([[0, cursor(`  → ${ring}`)]], cursor('  → Plan, search, build anything'))
		const sent: number[] = []
		await withDraftGuard(pane.adapter, exec, target, async () => sent.push(pane.elapsed()), {
			harness: 'cursor',
			ownText: (text) => text === ring,
			...pane.clock,
		})
		expect(sent).toHaveLength(1)
		expect(sent[0]).toBeLessThan(DRAFT_IDLE_MS)
		expect(pane.typed).toEqual(['\u0005', '\u0015'])
	})

	it('clears owned text that wraps onto several rows, rather than refusing it as a multi-row draft', async () => {
		const pane = fakePane([[0, cursor('  → You have unread mail —', '    check your inbox.')]], cursor('  → '))
		const sent: string[] = []
		await withDraftGuard(pane.adapter, exec, target, async () => sent.push('ring'), {
			harness: 'cursor',
			ownText: (text) => text.replace(/\s+/g, ' ') === 'You have unread mail — check your inbox.',
			...pane.clock,
		})
		expect(sent).toEqual(['ring'])
		expect(pane.typed).toEqual(['\u0005', '\u0015'])
	})

	it('sends when the pane cannot be read, leaving the send to report why', async () => {
		const adapter = {
			read: () => {
				throw new Error('pane gone')
			},
			sendText: () => {},
		} as unknown as MuxAdapter
		const sent: string[] = []
		await withDraftGuard(adapter, exec, target, async () => sent.push('ring'))
		expect(sent).toEqual(['ring'])
	})

	it('types the draft back even when the send fails, and still reports the failure', async () => {
		const pane = fakePane([[0, cursor('  → my draft')]], cursor('  → Plan, search, build anything'))
		await expect(
			withDraftGuard(
				pane.adapter,
				exec,
				target,
				async () => {
					throw new Error('never took the turn')
				},
				{ harness: 'cursor', ...pane.clock },
			),
		).rejects.toThrow('never took the turn')
		expect(pane.typed.at(-1)).toBe('my draft')
	})
})
