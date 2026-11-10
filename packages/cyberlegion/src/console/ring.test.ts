import type { MuxAdapter } from 'cyber-mux'
import { describe, expect, it } from 'vitest'
import type { Exec } from '../identity.ts'
import { ringTurn } from './ring.ts'

const exec: Exec = () => null
const MESSAGE = 'You have unread mail — check your inbox.'
const noSleep = async () => {}
const posted = { sleep: noSleep, requirePosted: true }

/** A fake pane: `read` returns the queued screens in turn (the last one repeats), `submit` records
 * whether it typed the message or sent a bare Enter. */
function fakePane(screens: string[], options: { exists?: boolean } = {}) {
	const submits: (string | undefined)[] = []
	let at = 0
	const adapter = {
		paneExists: () => options.exists ?? true,
		submit: (_exec: Exec, _target: unknown, text?: string) => {
			submits.push(text)
		},
		read: () => ({ text: screens[Math.min(at++, screens.length - 1)] ?? '' }),
	} as unknown as MuxAdapter
	return { adapter, submits }
}

// Trimmed from a live cursor-agent 2026.09 pane holding a rejected login token: the harness posts the
// ring to its transcript (or queues it as a follow-up) and puts the same text back in the input box.
const cursor = (...rows: string[]) =>
	['  Cursor Agent', '  v2026.09.26', '', ...rows, '', '', '  GPT-5.2 Medium', '  ~/code/x · main'].join('\n')
const AUTH_IDLE = cursor('  → Plan, search, build anything')
const AUTH_TAKEN_AND_RESTORED = cursor(`  ${MESSAGE}`, '', ' ⠀⠞ Working', '', `  → ${MESSAGE}`)
const STAGED_ONLY = cursor(`  → ${MESSAGE}`)
const TAKEN = cursor(
	`  ${MESSAGE}`,
	'',
	'  Checking the inbox.',
	'  No unread mail.',
	'',
	'  → Plan, search, build anything',
)

describe('ringTurn', () => {
	it('rings once when the harness takes the turn but puts the text back in its input box', async () => {
		const { adapter, submits } = fakePane([AUTH_IDLE, AUTH_TAKEN_AND_RESTORED])
		const result = await ringTurn(adapter, exec, { id: '%1' }, MESSAGE, { sleep: noSleep })
		expect(submits).toEqual([MESSAGE])
		expect(result).toEqual({ taken: true, resubmits: 0 })
	})

	it('still tells a fresh ring from an earlier copy of the same text on screen', async () => {
		const earlier = `  ${MESSAGE}`
		const before = cursor(earlier, '', '  done.', '', '  → Plan, search, build anything')
		const after = cursor(earlier, '', '  done.', '', `  ${MESSAGE}`, '', ' ⠀⠞ Working', '', `  → ${MESSAGE}`)
		const { adapter, submits } = fakePane([before, after])
		await ringTurn(adapter, exec, { id: '%1' }, MESSAGE, { sleep: noSleep })
		expect(submits).toEqual([MESSAGE])
	})

	it('flushes a swallowed Enter, never re-typing, when the text sits only in the input box', async () => {
		const { adapter, submits } = fakePane([AUTH_IDLE, STAGED_ONLY, TAKEN])
		const result = await ringTurn(adapter, exec, { id: '%1' }, MESSAGE, { sleep: noSleep })
		expect(submits).toEqual([MESSAGE, undefined])
		expect(result).toEqual({ taken: true, resubmits: 1 })
	})

	it('flushes a swallowed Enter even when an earlier copy of the text is on screen', async () => {
		const before = cursor(`  ${MESSAGE}`, '', '  → Plan, search, build anything')
		const staged = cursor(`  ${MESSAGE}`, '', `  → ${MESSAGE}`)
		const { adapter, submits } = fakePane([before, staged, TAKEN])
		await ringTurn(adapter, exec, { id: '%1' }, MESSAGE, { sleep: noSleep })
		expect(submits).toEqual([MESSAGE, undefined])
	})

	it('counts a vanished text as taken by default', async () => {
		const { adapter, submits } = fakePane([AUTH_IDLE, AUTH_IDLE])
		const result = await ringTurn(adapter, exec, { id: '%1' }, MESSAGE, { sleep: noSleep })
		expect(submits).toEqual([MESSAGE])
		expect(result).toEqual({ taken: true, resubmits: 0 })
	})

	it('with requirePosted, re-types the text when it vanished without the harness posting it', async () => {
		// typed before the harness drew its input box: nothing staged, no copy posted — the text is lost
		const { adapter, submits } = fakePane([AUTH_IDLE, AUTH_IDLE, AUTH_IDLE, TAKEN])
		const result = await ringTurn(adapter, exec, { id: '%1' }, MESSAGE, posted)
		expect(submits).toEqual([MESSAGE, MESSAGE])
		expect(result).toEqual({ taken: true, resubmits: 2 })
	})

	it('with requirePosted, gives a lost text one more settle to show up before re-typing it', async () => {
		const { adapter, submits } = fakePane([AUTH_IDLE, AUTH_IDLE, TAKEN])
		const result = await ringTurn(adapter, exec, { id: '%1' }, MESSAGE, posted)
		expect(submits).toEqual([MESSAGE])
		expect(result).toEqual({ taken: true, resubmits: 1 })
	})

	it('with requirePosted, throws rather than report the turn taken when the text keeps vanishing', async () => {
		const { adapter } = fakePane([AUTH_IDLE])
		await expect(ringTurn(adapter, exec, { id: '%1' }, MESSAGE, { ...posted, attempts: 4 })).rejects.toThrow(
			'never took the turn — the text vanished without the harness posting it',
		)
	})

	it('throws once the text stays staged past the attempt cap', async () => {
		const { adapter, submits } = fakePane([AUTH_IDLE, STAGED_ONLY])
		await expect(ringTurn(adapter, exec, { id: '%1' }, MESSAGE, { sleep: noSleep, attempts: 2 })).rejects.toThrow(
			'never took the turn',
		)
		expect(submits).toEqual([MESSAGE, undefined, undefined])
	})

	// Trimmed from a live Claude Code 2.1 pane. Keys typed while it boots are buffered and reach the
	// input box as one paste once it draws, so each Enter between them becomes a newline.
	const DOORBELL = 'Read your brief at /home/u/.cyberlegion/briefs/abc123.md, then begin work.'
	const RULE = '─'.repeat(60)
	const claude = (...rows: string[]) =>
		[' ▐▛███▜▌   Claude Code v2.1.322', '', ...rows, '  Opus 5.5  repo', '  ⏵⏵ auto mode on'].join('\n')
	const BOOTING = [' ▐▛███▜▌   Claude Code v2.1.322', ''].join('\n')
	const CLAUDE_IDLE = claude(RULE, '❯\u00a0', RULE)
	const CLAUDE_PASTED = claude(RULE, `❯\u00a0${DOORBELL}`, `  ${DOORBELL}`, `  ${DOORBELL}`, RULE)
	const CLAUDE_TAKEN = claude(`❯ ${DOORBELL}`, '', '● Reading the brief', '', RULE, '❯\u00a0', RULE)

	it('with requirePosted, waits for a booting harness to draw its input box before typing', async () => {
		const { adapter, submits } = fakePane([BOOTING, BOOTING, BOOTING, CLAUDE_IDLE, CLAUDE_TAKEN])
		const result = await ringTurn(adapter, exec, { id: '%1' }, DOORBELL, { ...posted, harness: 'claude' })
		expect(submits).toEqual([DOORBELL])
		expect(result).toEqual({ taken: true, resubmits: 0 })
	})

	it('with requirePosted, types anyway once the input box never shows within the budget', async () => {
		const { adapter, submits } = fakePane([BOOTING, BOOTING, CLAUDE_TAKEN])
		const result = await ringTurn(adapter, exec, { id: '%1' }, DOORBELL, { ...posted, harness: 'claude', attempts: 1 })
		expect(submits).toEqual([DOORBELL])
		expect(result).toEqual({ taken: true, resubmits: 0 })
	})

	it('flushes copies of the text pasted together in the input box, not count them as posted', async () => {
		const { adapter, submits } = fakePane([CLAUDE_IDLE, CLAUDE_PASTED, CLAUDE_TAKEN])
		const result = await ringTurn(adapter, exec, { id: '%1' }, DOORBELL, { ...posted, harness: 'claude' })
		expect(submits).toEqual([DOORBELL, undefined])
		expect(result).toEqual({ taken: true, resubmits: 1 })
	})

	it('rejects a gone pane without typing', async () => {
		const { adapter, submits } = fakePane([''], { exists: false })
		await expect(ringTurn(adapter, exec, { id: '%1' }, MESSAGE, { sleep: noSleep })).rejects.toThrow('no longer exists')
		expect(submits).toEqual([])
	})
})
