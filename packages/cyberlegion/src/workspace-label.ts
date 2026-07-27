/**
 * Workspace labels — the short, human-scannable name a `workspace` placement opens under.
 *
 * A unit's own visible space is what a human scans to find a session, so a bare backend default
 * ("workspace 4") costs a search every time. A label is `<code>-<subject>`, capped at 30 characters
 * INCLUDING the code, so it stays readable in a sidebar/status bar at a glance.
 *
 * The code is a NieR YoRHa unit class picked from the brief's leading action word in one fixed
 * order, so the same brief always yields the same code:
 *   - `A2-` — the action tears down or reverts (A2 is the rogue/attack unit)
 *   - `9S-` — the action is read-only recon (9S is the Scanner)
 *   - `2B-` — everything else: build-and-change work, the default (2B is the battle unit)
 */

/** Total label budget, code included. */
const LABEL_CAP = 30

/** Every code is the same width, so the subject budget is a constant. */
const CODE_WIDTH = 3

/** Leading actions that tear down or revert — the `A2-` class, checked first. */
const TEARDOWN_ACTIONS = new Set([
	'clean',
	'cleanup',
	'decommission',
	'delete',
	'deprecate',
	'disable',
	'drop',
	'prune',
	'purge',
	'remove',
	'retire',
	'revert',
	'revoke',
	'rollback',
	'teardown',
	'undo',
	'uninstall',
	'unregister',
])

/** Leading actions that only look and report — the `9S-` class, checked after teardown. */
const RECON_ACTIONS = new Set([
	'analyze',
	'assess',
	'audit',
	'check',
	'compare',
	'debug',
	'diagnose',
	'evaluate',
	'examine',
	'explain',
	'explore',
	'find',
	'identify',
	'inspect',
	'investigate',
	'locate',
	'measure',
	'profile',
	'read',
	'reproduce',
	'research',
	'review',
	'scan',
	'survey',
	'trace',
	'triage',
	'verify',
])

/**
 * Leading actions that build or change — the `2B-` class. `2B-` is also the code for a brief whose
 * lead matches nothing at all, but the two cases differ in the SUBJECT: a recognized action is
 * dropped from it (the code already says "build"), an unrecognized leading word is kept (it is the
 * subject's own first noun, and dropping it would strip real signal).
 */
const BUILD_ACTIONS = new Set([
	'add',
	'backfill',
	'build',
	'create',
	'document',
	'enable',
	'extend',
	'fix',
	'generalize',
	'harden',
	'implement',
	'introduce',
	'make',
	'migrate',
	'move',
	'port',
	'refactor',
	'rename',
	'replace',
	'rework',
	'ship',
	'split',
	'support',
	'swap',
	'update',
	'wire',
	'write',
])

/** Dropped when it leads the subject — an article carries no identifying signal. */
const LEADING_ARTICLES = new Set(['a', 'an', 'the'])

export interface WorkspaceLabelInput {
	/** The spawn's brief text; its first non-empty line is the subject source. */
	brief: string
	/** The caller's own short name for the unit, when given — preferred over the brief. */
	handle?: string
	/** The unit's id; its 6-char slice is the last-resort subject (the default handle's own slice). */
	id: string
}

/**
 * Resolve the label a `workspace` placement opens under. Total width never exceeds `LABEL_CAP`, and
 * the result always carries a code — a brief that yields no usable subject falls back to the unit's
 * own short id rather than to a bare code.
 */
export function deriveWorkspaceLabel(input: WorkspaceLabelInput): string {
	const briefWords = tokenize(firstNonEmptyLine(input.brief))
	// The code is read off the BRIEF's action even when `--handle` supplies the subject — the handle
	// names the unit, the brief says what it is being sent to do.
	const lead = briefWords[0]
	let code = '2B-'
	let leadIsAction = false
	if (lead && TEARDOWN_ACTIONS.has(lead)) {
		code = 'A2-'
		leadIsAction = true
	} else if (lead && RECON_ACTIONS.has(lead)) {
		code = '9S-'
		leadIsAction = true
	} else if (lead && BUILD_ACTIONS.has(lead)) {
		leadIsAction = true
	}

	let subjectWords: string[]
	if (input.handle) {
		subjectWords = tokenize(input.handle)
	} else {
		// The code already carries the action, so repeating it in the subject spends the budget twice.
		subjectWords = leadIsAction ? briefWords.slice(1) : briefWords.slice()
		if (subjectWords[0] && LEADING_ARTICLES.has(subjectWords[0])) subjectWords.shift()
	}

	const budget = LABEL_CAP - CODE_WIDTH
	const subject = fitWords(subjectWords, budget) || input.id.slice(0, 6)
	return `${code}${subject}`
}

/** The brief's first line with any content — a leading blank line is not the subject. */
function firstNonEmptyLine(brief: string): string {
	for (const line of brief.split('\n')) {
		if (line.trim() !== '') return line
	}
	return ''
}

/** Lowercase alphanumeric runs; every other character is a separator, never part of a word. */
function tokenize(text: string): string[] {
	return text
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter((w) => w !== '')
}

/**
 * Join whole words with `-` while they fit `budget`, so the label ends on a complete word rather
 * than mid-word. A single first word wider than the whole budget is hard-truncated — that is the
 * only case where a label can end mid-word, and the alternative is no subject at all.
 */
function fitWords(words: string[], budget: number): string {
	if (words.length === 0) return ''
	let out = words[0]!.slice(0, budget)
	for (const word of words.slice(1)) {
		const next = `${out}-${word}`
		if (next.length > budget) break
		out = next
	}
	return out
}
