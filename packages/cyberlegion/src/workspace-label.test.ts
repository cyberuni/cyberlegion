import { describe, expect, it } from 'vitest'
import { deriveWorkspaceLabel } from './workspace-label.ts'

// ── spec:cyberlegion/unit/lifecycle — a workspace placement is labeled so a human can find it ──
describe('deriveWorkspaceLabel', () => {
	it('labels the space with a code plus a subject drawn from the brief, within the 30-char cap', () => {
		const label = deriveWorkspaceLabel({ brief: 'add a retry budget to the mail poller', id: 'abc123def' })
		expect(label).toBe('2B-retry-budget-to-the-mail')
		expect(label.length).toBeLessThanOrEqual(30)
	})

	it.each([
		['remove the dead reconcile branch', 'A2-'],
		['investigate the flaky mail wait', '9S-'],
		['rename the pane index to locator', '2B-'],
	])('picks the code from the leading action: %s', (brief, code) => {
		expect(deriveWorkspaceLabel({ brief, id: 'abc123def' }).startsWith(code)).toBe(true)
	})

	it('gives a recognized build action the 2B code and drops it from the subject', () => {
		expect(deriveWorkspaceLabel({ brief: 'wire the relay to the hub', id: 'abc123def' })).toBe('2B-relay-to-the-hub')
	})

	it('drops the matched action and the article it led with rather than repeating them in the subject', () => {
		const label = deriveWorkspaceLabel({ brief: 'audit the governance provenance check', id: 'abc123def' })
		expect(label).toBe('9S-governance-provenance-check')
		expect(label.length).toBe(30)
	})

	it('keeps a leading word that is not a matched action, so the subject never loses real signal', () => {
		// `governance` is not an action word — dropping it would strip the subject's own first noun.
		expect(deriveWorkspaceLabel({ brief: 'governance provenance check', id: 'abc123def' })).toBe(
			'2B-governance-provenance-check',
		)
	})

	it('cuts a too-long brief at a word boundary rather than mid-word', () => {
		const label = deriveWorkspaceLabel({
			brief: 'refactor the session adapter placement resolution',
			id: 'abc123def',
		})
		expect(label).toBe('2B-session-adapter-placement')
		expect(label.endsWith('-')).toBe(false)
	})

	it('hard-truncates a single first word wider than the whole budget — the one mid-word case', () => {
		expect(deriveWorkspaceLabel({ brief: 'x'.repeat(40), id: 'abc123def' })).toBe(`2B-${'x'.repeat(27)}`)
	})

	it('truncates an over-wide first word rather than dropping it and falling back to the short id', () => {
		// A real word, followed by another that would fit if the first were dropped — so "dropped the
		// unfittable word" and "fell back to the short id" are both distinguishable outcomes here,
		// which `'x'.repeat(40)` alone cannot tell apart.
		const label = deriveWorkspaceLabel({ brief: 'supercalifragilisticexpialidocious vents', id: 'abc123def' })
		expect(label).toBe('2B-supercalifragilisticexpiali')
		expect(label.length).toBe(30)
	})

	it('draws the subject from the first line with content, skipping blank leading lines', () => {
		// The leading action on the CONTENT line drives the code too — a reader that took line 0
		// verbatim would see an empty brief and fall back to the short id with a 2B code.
		expect(deriveWorkspaceLabel({ brief: '\n\nprune the orchard netting', id: 'abc123def' })).toBe('A2-orchard-netting')
	})

	it('takes the subject from --handle when given, but still reads the code off the brief', () => {
		expect(deriveWorkspaceLabel({ brief: 'diagnose the boot race', handle: 'scribe', id: 'abc123def' })).toBe(
			'9S-scribe',
		)
	})

	// Both fallback cases run on an id whose first six characters are NOT the literal every other
	// fixture here uses. With `abc123def` everywhere, a fallback hardcoded to the string 'abc123'
	// matched the fixture instead of computing anything, and the assertion could not tell a real
	// slice from a constant.
	const FALLBACK_ID = 'zq7w4m1x8'

	it("falls back to the unit's 6-char short id when the brief yields no usable subject", () => {
		expect(deriveWorkspaceLabel({ brief: '!!! ???', id: FALLBACK_ID })).toBe('2B-zq7w4m')
	})

	it('falls back to the short id when the action word is the entire brief', () => {
		// The action is dropped into the code, so nothing is left to name the space with.
		expect(deriveWorkspaceLabel({ brief: 'investigate', id: FALLBACK_ID })).toBe('9S-zq7w4m')
	})

	it('reads the subject off the first non-empty line, not a leading blank one', () => {
		expect(deriveWorkspaceLabel({ brief: '\n\n  review the doorbell gate\nrest of brief', id: 'abc123def' })).toBe(
			'9S-doorbell-gate',
		)
	})

	it('is deterministic — the same brief always yields the same label', () => {
		const input = { brief: 'prune the stale pane index', id: 'abc123def' }
		expect(deriveWorkspaceLabel(input)).toBe(deriveWorkspaceLabel(input))
		expect(deriveWorkspaceLabel(input)).toBe('A2-stale-pane-index')
	})

	it('never exceeds the cap across a spread of briefs', () => {
		for (const brief of [
			'implement a cross-workspace focus beam for the doorbell path',
			'DELETE THE ENTIRE RECONCILE SUBSYSTEM AND ITS TESTS',
			'investigate/diagnose: mail-await hangs (#1234) under contention',
		]) {
			expect(deriveWorkspaceLabel({ brief, id: 'abc123def' }).length).toBeLessThanOrEqual(30)
		}
	})
})
