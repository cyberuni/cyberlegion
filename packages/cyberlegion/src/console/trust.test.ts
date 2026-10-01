import type { MuxTarget } from 'cyber-mux'
import { describe, expect, it } from 'vitest'
import type { Exec } from '../identity.ts'
import { answerTrustPrompt, showsTrustPrompt } from './trust.ts'

// The screens below are the prompts as each harness drew them in a real tmux pane on a folder it did
// not trust: Claude Code 2.1.286, Codex 0.153.4, and cursor-agent 2026.09.26.
const CLAUDE_PROMPT = (focus: 'no' | 'yes') => `
 Accessing workspace:
 /work/repo.worktrees/legion-abc123
 Quick safety check: Is this a project you created or one you trust? (Like your own code, a well-known open source project, or work from
 your team). If not, take a moment to review what's in this folder first.
 Claude Code'll be able to read, edit, and execute files here.
 Security guide
 ${focus === 'no' ? '❯' : ' '} No, exit
 ${focus === 'yes' ? '❯' : ' '} Yes, I trust this folder
 Enter to confirm · Esc to cancel`

const CODEX_PROMPT = (focus: 1 | 2) => `
> You are in /work/repo.worktrees/legion-abc123
  Do you trust the contents of this directory? Working with untrusted contents comes with higher risk of prompt injection. Trusting the
  directory allows project-local config, hooks, and exec policies to load.
${focus === 1 ? '›' : ' '} 1. Yes, continue
${focus === 2 ? '›' : ' '} 2. No, quit
  Press enter to continue`

const CURSOR_PROMPT = `
  ╭──────────────────────────────────────────────╮
  │  ⚠ Workspace Trust Required                   │
  │  Cursor Agent can execute code and access files in this directory.
  │  Do you trust the contents of this directory?
  │    /work/repo.worktrees/legion-abc123
  │  ▶ [a] Trust this workspace
  │    [q] Quit
  │  Use arrow keys to navigate, Enter to select, or press the key shown
  ╰──────────────────────────────────────────────╯`

const LAUNCH_LINE = '$ CYBER_MUX=tmux claude'
const READY = '╭────╮\n│ > │\n╰────╯\n  ? for shortcuts'

const exec: Exec = () => null
const target: MuxTarget = { id: '%9' }
const noSleep = { sleep: async () => {} }

/**
 * A pane whose screen is a script: each read returns the next frame (the last one repeats), and a
 * frame may instead react to the keys pressed so far. Every key and every literal text is recorded
 * in order, so a test can see exactly what reached the pane.
 */
function fakePane(frames: Array<string | ((pressed: string[]) => string)>) {
	const pressed: string[] = []
	let i = 0
	return {
		pressed,
		adapter: {
			read: () => {
				const frame = frames[Math.min(i, frames.length - 1)] as string | ((p: string[]) => string)
				i++
				return { text: typeof frame === 'function' ? frame(pressed) : frame }
			},
			sendKeys: (_e: Exec, _t: MuxTarget, keys: string[]) => void pressed.push(...keys),
			sendText: (_e: Exec, _t: MuxTarget, text: string) => void pressed.push(`text:${text}`),
		},
	}
}

/** A Claude pane that draws its trust prompt, moves focus on Down, and clears on Enter only from "Yes". */
function claudeTrustPane(opts: { ignoreFirstDown?: boolean } = {}) {
	let downs = 0
	let focus: 'no' | 'yes' = 'no'
	let trusted = false
	let exited = false
	let seen = 0
	return fakePane([
		LAUNCH_LINE,
		(pressed) => {
			for (; seen < pressed.length; seen++) {
				const key = pressed[seen]
				if (key === 'Down') {
					downs++
					if (!(opts.ignoreFirstDown && downs === 1)) focus = 'yes'
				}
				if (key === 'Enter') {
					if (focus === 'yes') trusted = true
					else exited = true
				}
			}
			if (exited) return '$ '
			return trusted ? READY : CLAUDE_PROMPT(focus)
		},
	])
}

describe('showsTrustPrompt recognises each harness by its own wording', () => {
	it.each([
		['claude', CLAUDE_PROMPT('no')],
		['codex', CODEX_PROMPT(1)],
		['cursor', CURSOR_PROMPT],
	] as const)('%s', (harness, screen) => {
		expect(showsTrustPrompt(harness, screen)).toBe(true)
	})

	it("does not take another harness's prompt, or a ready screen, as this harness's prompt", () => {
		expect(showsTrustPrompt('claude', CURSOR_PROMPT)).toBe(false)
		expect(showsTrustPrompt('cursor', CLAUDE_PROMPT('no'))).toBe(false)
		expect(showsTrustPrompt('claude', READY)).toBe(false)
	})

	it("recognises Codex's newer wording as well", () => {
		const newer = '  Trust this folder? Codex can read, edit, and run files here.\n› 1. Trust and continue\n  2. Quit'
		expect(showsTrustPrompt('codex', newer)).toBe(true)
	})
})

describe('spec:cyberlegion/unit/lifecycle spawn answers the folder-trust prompt', () => {
	const input = { harness: 'claude', folder: '/work/repo.worktrees/legion-abc123', pane: '%9' } as const

	it("a worktree spawn accepts the harness's folder-trust prompt, then rings the first turn", async () => {
		const pane = claudeTrustPane()
		const res = await answerTrustPrompt(pane.adapter, exec, target, { ...input, policy: 'accept' }, noSleep)
		expect(res.state).toBe('accepted')
		expect(pane.pressed).toEqual(['Down', 'Enter'])
	})

	it('moves the selection onto the trust option before it presses Enter, even when the first Down is dropped', async () => {
		const pane = claudeTrustPane({ ignoreFirstDown: true })
		const res = await answerTrustPrompt(pane.adapter, exec, target, { ...input, policy: 'accept' }, noSleep)
		expect(res.state).toBe('accepted')
		// Enter is pressed only once the screen shows "Yes" selected — never on "No, exit"
		expect(pane.pressed).toEqual(['Down', 'Down', 'Enter'])
	})

	it('never presses Enter while the selection stays on the exit option', async () => {
		const pane = fakePane([LAUNCH_LINE, CLAUDE_PROMPT('no')])
		const res = await answerTrustPrompt(pane.adapter, exec, target, { ...input, policy: 'accept' }, noSleep)
		expect(res.state).toBe('stuck')
		expect(pane.pressed).not.toContain('Enter')
	})

	it.each([
		['codex', CODEX_PROMPT(2), CODEX_PROMPT(1), ['text:1', 'Enter']],
		['cursor', CURSOR_PROMPT, CURSOR_PROMPT, ['text:a']],
	] as const)(
		"a worktree spawn accepts %s's own trust prompt with its own keys",
		async (harness, before, selected, keys) => {
			let seen = 0
			let chosen = false
			let cleared = false
			const pane = fakePane([
				LAUNCH_LINE,
				(pressed) => {
					for (; seen < pressed.length; seen++) {
						const key = pressed[seen]
						if (harness === 'codex' && key === 'text:1') chosen = true
						if (harness === 'codex' && key === 'Enter' && chosen) cleared = true
						if (harness === 'cursor' && key === 'text:a') cleared = true
					}
					if (cleared) return READY
					return chosen ? selected : before
				},
			])
			const res = await answerTrustPrompt(pane.adapter, exec, target, { ...input, harness, policy: 'accept' }, noSleep)
			expect(res.state).toBe('accepted')
			expect(pane.pressed).toEqual(keys)
		},
	)

	it('a spawn whose pane settles without a trust prompt sends no trust keys', async () => {
		const pane = fakePane([LAUNCH_LINE, READY])
		const res = await answerTrustPrompt(pane.adapter, exec, target, { ...input, policy: 'accept' }, noSleep)
		expect(res.state).toBe('none')
		expect(pane.pressed).toEqual([])
	})

	it('a prompt drawn after an early quiet screen is still caught', async () => {
		// The harness's own banner holds still while it loads, then the trust prompt appears. Settling
		// takes several equal reads, so one quiet frame is not taken as "no prompt".
		const pane = fakePane([LAUNCH_LINE, 'Loading…', 'Loading…', CLAUDE_PROMPT('no')])
		const res = await answerTrustPrompt(pane.adapter, exec, target, { ...input, policy: 'ask' }, noSleep)
		expect(res.state).toBe('needs-human')
	})

	it('a screen that never changes from before the harness drew is not taken as settled', async () => {
		// A harness still booting leaves the launch line on screen; that quiet is not "no prompt".
		const pane = fakePane([LAUNCH_LINE])
		const res = await answerTrustPrompt(
			pane.adapter,
			exec,
			target,
			{ ...input, policy: 'accept' },
			{
				...noSleep,
				timeoutMs: 2_000,
				pollMs: 500,
			},
		)
		expect(res.state).toBe('unsettled')
		expect(pane.pressed).toEqual([])
	})

	it('a pane whose screen stays blank is given up on early, not watched for the whole timeout', async () => {
		// A real pane draws its shell at once; a screen that stays blank is a backend that cannot show
		// it, and watching it for the full timeout would only delay the spawn.
		const pane = fakePane([''])
		let reads = 0
		const adapter = { ...pane.adapter, read: () => (reads++, { text: '' }) }
		const res = await answerTrustPrompt(adapter, exec, target, { ...input, policy: 'accept' }, noSleep)
		expect(res.state).toBe('unsettled')
		expect(reads).toBeLessThanOrEqual(7)
	})

	it('a trust prompt that does not clear after the accept keys is reported, naming the folder and the harness', async () => {
		const pane = fakePane([LAUNCH_LINE, CURSOR_PROMPT])
		const res = await answerTrustPrompt(
			pane.adapter,
			exec,
			target,
			{ ...input, harness: 'cursor', policy: 'accept' },
			noSleep,
		)
		expect(res.state).toBe('stuck')
		if (res.state !== 'stuck') return
		expect(res.message).toContain(input.folder)
		expect(res.message).toContain('cursor')
	})

	it('a --cwd spawn leaves the trust prompt for a person, naming the folder, the harness, and the pane', async () => {
		const pane = fakePane([LAUNCH_LINE, CLAUDE_PROMPT('no')])
		const res = await answerTrustPrompt(pane.adapter, exec, target, { ...input, policy: 'ask' }, noSleep)
		expect(res.state).toBe('needs-human')
		expect(pane.pressed).toEqual([])
		if (res.state !== 'needs-human') return
		expect(res.message).toContain(input.folder)
		expect(res.message).toContain('claude')
		expect(res.message).toContain('%9')
	})

	it('waits before the first key so a harness that ignores early input still sees it', async () => {
		const slept: number[] = []
		const pane = claudeTrustPane()
		await answerTrustPrompt(
			pane.adapter,
			exec,
			target,
			{ ...input, policy: 'accept' },
			{
				sleep: async (ms) => void slept.push(ms),
				keyDelayMs: 1_000,
			},
		)
		expect(slept).toContain(1_000)
	})

	it('a read that fails is treated as a screen with nothing on it', async () => {
		let reads = 0
		const adapter = {
			read: () => {
				reads++
				if (reads === 2) throw new Error('capture failed')
				return { text: reads === 1 ? LAUNCH_LINE : READY }
			},
			sendKeys: () => {},
			sendText: () => {},
		}
		const res = await answerTrustPrompt(adapter, exec, target, { ...input, policy: 'accept' }, noSleep)
		expect(res.state).toBe('none')
	})
})
