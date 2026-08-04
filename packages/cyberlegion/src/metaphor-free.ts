// check:metaphor-free — the vocabulary-boundary guard.
//
// cyberlegion is chartered metaphor-free: no fleet-persona or place vocabulary. This module scans
// the package's in-scope files for a banned term in its capitalized persona-form and reports each
// unsanctioned occurrence as a violation. See .agents/spec/metaphor-free/README.md for the frozen
// contract this module implements.
//
// NOTE: this file (and its test) are on the guard's own exclusion list (EXCLUDED_FILES) — they must
// name the banned terms literally to define and test the guard, and scanning them would flag the
// guard's own definition as a leak.

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

/** The maintained banned-term list — fleet-persona/place names owned by the plugin layers, matched
 * in their capitalized proper-noun form. Grows as new personas appear; not a manufactured taxonomy. */
const BANNED_TERMS = ['Bunker', 'Council', 'Operator', 'Pod'] as const

type BannedTerm = (typeof BANNED_TERMS)[number]

/** A sanctioned occurrence, keyed by (relative file path, term, a stable substring of the sanctioned
 * line) rather than a line number, so it survives line drift but stays per-occurrence. Seeded from
 * the three legitimate outward-caller references present today (four term-occurrences, three lines). */
interface AllowListEntry {
	file: string
	term: BannedTerm
	contains: string
}

const ALLOW_LIST: AllowListEntry[] = [
	{
		file: '.agents/spec/unit/lifecycle/README.md',
		term: 'Operator',
		contains: "cyberfleet`'s Operator) is mux-agnostic",
	},
	{
		file: '.agents/spec/unit/lifecycle/README.md',
		term: 'Operator',
		contains: 'fixes every caller at once (Operator, Pod, and the Legate',
	},
	{
		file: '.agents/spec/unit/lifecycle/README.md',
		term: 'Pod',
		contains: 'fixes every caller at once (Operator, Pod, and the Legate',
	},
	{
		file: '.agents/spec/unit/lifecycle/lifecycle.feature',
		term: 'Operator',
		contains: 'fleet-layer caller (Operator) is mux-agnostic',
	},
]

/** The two in-scope roots (relative to the package root). Everything else under the package is out
 * of scope for this guard. */
const IN_SCOPE_ROOTS = ['src', '.agents/spec']

/** Whole-directory exclusions: a file under any of these prefixes is not scanned at all.
 * (a) the ledger — provenance that records past leaks verbatim.
 * (b) this node's own README + .feature — they must name the banned terms literally to define them. */
const EXCLUDED_PATH_PREFIXES = ['.agents/spec/ledger/', '.agents/spec/metaphor-free/']

/** Whole-file exclusions: the guard's own implementation + test, which must name the banned terms
 * literally as string constants and fixtures. An explicit, reviewable set — grow it here, not by
 * carving out lines. */
const EXCLUDED_FILES = ['src/metaphor-free.ts', 'src/metaphor-free.test.ts']

const SKIP_DIR_NAMES = new Set(['node_modules', 'dist', '.git'])

export interface Violation {
	file: string
	line: number
	term: BannedTerm
}

export interface TermMatch {
	term: BannedTerm
	index: number
}

function escapeRegExp(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Matches a banned term in one line of text, case-sensitively on its capitalized persona-form: a
 * whole word, or a distinct capitalized segment of a compound identifier (`resolveBunker`,
 * `CouncilInbox`). Does not match a lowercase generic word sharing the same letters, nor a longer
 * word that merely contains the term as a substring forming a different word (`Podcast`). A single
 * trailing lowercase `s` still counts as the term (its plural, `Pods`). */
export function matchBannedTerms(line: string, bannedTerms: readonly string[] = BANNED_TERMS): TermMatch[] {
	const matches: TermMatch[] = []
	for (const term of bannedTerms) {
		const pattern = new RegExp(`(?<![A-Z])${escapeRegExp(term)}(?:s(?![a-z]))?(?![a-z])`, 'g')
		let m: RegExpExecArray | null
		while ((m = pattern.exec(line))) {
			matches.push({ term: term as BannedTerm, index: m.index })
		}
	}
	return matches
}

function toPosix(p: string): string {
	return p.split(sep).join('/')
}

function isExcludedPath(
	relPath: string,
	excludedPrefixes: readonly string[],
	excludedFiles: readonly string[],
): boolean {
	if (excludedFiles.includes(relPath)) return true
	return excludedPrefixes.some((prefix) => relPath.startsWith(prefix))
}

function isAllowed(relPath: string, term: BannedTerm, lineText: string, allowList: readonly AllowListEntry[]): boolean {
	return allowList.some((entry) => entry.file === relPath && entry.term === term && lineText.includes(entry.contains))
}

function walk(dir: string, root: string, results: string[]): void {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		if (entry.isDirectory()) {
			if (SKIP_DIR_NAMES.has(entry.name)) continue
			walk(join(dir, entry.name), root, results)
		} else if (entry.isFile()) {
			results.push(relative(root, join(dir, entry.name)))
		}
	}
}

function collectFiles(root: string, inScopeRoots: readonly string[]): string[] {
	const results: string[] = []
	for (const r of inScopeRoots) {
		const abs = join(root, r)
		if (!existsSync(abs)) continue
		walk(abs, root, results)
	}
	return results
}

export interface ScanOptions {
	bannedTerms?: readonly string[]
	allowList?: readonly AllowListEntry[]
	excludedPrefixes?: readonly string[]
	excludedFiles?: readonly string[]
	inScopeRoots?: readonly string[]
}

const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** Scans the in-scope files under `root` (default: the cyberlegion package directory) and returns
 * every unsanctioned banned-term occurrence. Empty means clean. `options` lets callers (tests)
 * substitute fixture-scoped config in place of the real banned list / allow-list / exclusions /
 * scope roots. */
export function findMetaphorViolations(root: string = defaultRoot, options: ScanOptions = {}): Violation[] {
	const bannedTerms = options.bannedTerms ?? BANNED_TERMS
	const allowList = options.allowList ?? ALLOW_LIST
	const excludedPrefixes = options.excludedPrefixes ?? EXCLUDED_PATH_PREFIXES
	const excludedFiles = options.excludedFiles ?? EXCLUDED_FILES
	const inScopeRoots = options.inScopeRoots ?? IN_SCOPE_ROOTS

	const violations: Violation[] = []
	for (const rawRelPath of collectFiles(root, inScopeRoots)) {
		const relPath = toPosix(rawRelPath)
		if (isExcludedPath(relPath, excludedPrefixes, excludedFiles)) continue

		let content: string
		try {
			content = readFileSync(join(root, rawRelPath), 'utf8')
		} catch {
			continue
		}

		const lines = content.split('\n')
		lines.forEach((lineText, i) => {
			for (const { term } of matchBannedTerms(lineText, bannedTerms)) {
				if (isAllowed(relPath, term as BannedTerm, lineText, allowList)) continue
				violations.push({ file: relPath, line: i + 1, term: term as BannedTerm })
			}
		})
	}
	return violations
}
