// Tests for the check:metaphor-free vocabulary-boundary guard.
//
// One test per frozen scenario in .agents/spec/metaphor-free/metaphor-free.feature (12 total, named
// to echo the scenario title), plus a combinatorial truth table over the matcher — the pyramid base,
// separate from the per-scenario duty. Fixtures use fresh domains/names the spec's own worked
// examples (`resolveBunker`, `Podcast`, `pod`, `operator`) don't use, per the swap test: a Given is a
// test vector, not literal apparatus to special-case.
//
// This file is on the guard's own EXCLUDED_FILES list — it must name the banned terms literally as
// fixtures.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { findMetaphorViolations, matchBannedTerms } from './metaphor-free.js'

let root: string

/** The package's directory relative to the repo root — the guard's paths are repo-relative. */
const PKG = 'packages/cyberlegion'

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), 'metaphor-free-'))
})

afterEach(() => {
	rmSync(root, { recursive: true, force: true })
})

function writeFile(relPath: string, content: string): void {
	const abs = join(root, relPath)
	mkdirSync(join(abs, '..'), { recursive: true })
	writeFileSync(abs, content)
}

describe('check:metaphor-free — per-scenario verification', () => {
	it('a persona name in a source identifier fails the guard', () => {
		writeFile(`${PKG}/src/queue.ts`, 'export function lockBunkerDoor() {}\n')

		const violations = findMetaphorViolations(root, { allowList: [] })

		expect(violations).toEqual([{ file: `${PKG}/src/queue.ts`, line: 1, term: 'Bunker' }])
	})

	it('a persona name in a spec document fails the guard', () => {
		writeFile(`${PKG}/.agents/spec/widget/README.md`, 'This module hands the request to the Pod for scheduling.\n')

		const violations = findMetaphorViolations(root, { allowList: [] })

		expect(violations).toEqual([{ file: `${PKG}/.agents/spec/widget/README.md`, line: 1, term: 'Pod' }])
	})

	it('a persona name in a plugin skill fails the guard', () => {
		writeFile(`${PKG}/skills/billing/SKILL.md`, 'Escalate the refund to the Council before closing.\n')

		const violations = findMetaphorViolations(root, { allowList: [] })

		expect(violations).toEqual([{ file: `${PKG}/skills/billing/SKILL.md`, line: 1, term: 'Council' }])
	})

	it('a persona name in a plugin subagent definition fails the guard', () => {
		writeFile(`${PKG}/agents/archivist.md`, 'Files each record, then pings the Operator.\n')

		const violations = findMetaphorViolations(root, { allowList: [] })

		expect(violations).toEqual([{ file: `${PKG}/agents/archivist.md`, line: 1, term: 'Operator' }])
	})

	it("a persona name in the plugin's project spec fails the guard", () => {
		writeFile('.agents/specs/garden-plugin/watering/README.md', 'Watering waits for the Pod to confirm.\n')

		const violations = findMetaphorViolations(root, { allowList: [] })

		expect(violations).toEqual([{ file: '.agents/specs/garden-plugin/watering/README.md', line: 1, term: 'Pod' }])
	})

	it('a lowercase generic word passes the guard', () => {
		writeFile(`${PKG}/src/golf.ts`, '// the ball landed in the bunker\n')

		const violations = findMetaphorViolations(root, { allowList: [] })

		expect(violations).toEqual([])
	})

	it('a word that merely contains a banned term passes the guard', () => {
		writeFile(`${PKG}/src/roles.ts`, 'class Councilor {}\n')

		const violations = findMetaphorViolations(root, { allowList: [] })

		expect(violations).toEqual([])
	})

	it('a sanctioned boundary reference passes the guard', () => {
		writeFile(
			`${PKG}/.agents/spec/handoff/README.md`,
			'The fleet layer owns the Operator; this package stays generic.\n',
		)

		const violations = findMetaphorViolations(root, {
			allowList: [
				{
					file: `${PKG}/.agents/spec/handoff/README.md`,
					term: 'Operator',
					contains: 'owns the Operator; this package',
				},
			],
		})

		expect(violations).toEqual([])
	})

	it('a banned term recorded in provenance passes the guard', () => {
		writeFile(
			`${PKG}/.agents/spec/ledger/some-past-fix.abc123.jsonl`,
			'{"why":"fixed the Council metaphor leak in the resolver"}\n',
		)

		const violations = findMetaphorViolations(root, { allowList: [] })

		expect(violations).toEqual([])
	})

	it("a banned term recorded in the plugin spec's provenance passes the guard", () => {
		writeFile(
			'.agents/specs/cyberlegion-plugin/ledger/some-past-decision.def456.jsonl',
			'{"why":"the Operator ratified the relay change"}\n',
		)

		const violations = findMetaphorViolations(root, { allowList: [] })

		expect(violations).toEqual([])
	})

	it("the guard's own defining document passes the guard", () => {
		writeFile(
			`${PKG}/.agents/spec/metaphor-free/README.md`,
			'The banned terms are Bunker, Council, Operator, and Pod.\n',
		)

		const violations = findMetaphorViolations(root, { allowList: [] })

		expect(violations).toEqual([])
	})

	it('a clean multi-file package passes the guard', () => {
		writeFile(`${PKG}/src/a.ts`, 'const owner = "Operator"\n')
		writeFile(`${PKG}/.agents/spec/b/README.md`, 'Handed off to the Pod for retries.\n')

		const violations = findMetaphorViolations(root, {
			allowList: [
				{ file: `${PKG}/src/a.ts`, term: 'Operator', contains: 'const owner = "Operator"' },
				{
					file: `${PKG}/.agents/spec/b/README.md`,
					term: 'Pod',
					contains: 'Handed off to the Pod for retries',
				},
			],
		})

		expect(violations).toEqual([])
	})
})

describe('matchBannedTerms — matcher truth table (pyramid base)', () => {
	const cases: Array<[name: string, line: string, expected: string[]]> = [
		['capitalized whole word', 'The Bunker was empty', ['Bunker']],
		['camelCase segment, mid-identifier', 'lockBunkerDoor()', ['Bunker']],
		['PascalCase segment, compound identifier', 'CouncilRoster.load()', ['Council']],
		['lowercase generic word sharing letters, no match', 'the ball rolled into the bunker', []],
		['substring of a longer word, no match', 'elected as Councilor', []],
		['trailing lowercase s still counts as the term (plural)', 'three Pods were scheduled', ['Pod']],
		['capitalized segment followed by uppercase continuation', 'PodStore.create()', ['Pod']],
		['term at the very start of the line', 'Operator dispatch', ['Operator']],
		['term at the very end of the line', 'reports to the Operator', ['Operator']],
		['two distinct terms on one line', 'Operator and Pod both apply', ['Operator', 'Pod']],
		['no banned term present at all', 'the caller runs the task and exits', []],
	]

	for (const [name, line, expected] of cases) {
		it(name, () => {
			expect(matchBannedTerms(line).map((m) => m.term)).toEqual(expected)
		})
	}
})

// CI enforcement: run the guard over the REAL repo tree (every in-scope root) on every test run,
// so a future unsanctioned persona leak fails `pnpm test` -> `pnpm verify` -> CI. This realizes the
// charter — the boundary is enforced by a script on every run, not re-discovered by a judge each
// mission. Distinct from the 12 synthetic per-scenario tests above: this one asserts the live tree,
// not a fixture.
describe('the live cyberlegion package stays metaphor-free', () => {
	it('has no unsanctioned capitalized persona name in any in-scope file', () => {
		const violations = findMetaphorViolations()
		expect(violations, JSON.stringify(violations, null, 2)).toEqual([])
	})

	// A scan that reaches no file passes vacuously: a default root resolved one directory off finds
	// nothing and reports clean. Probe with the plugin's own `Legate` — present in every in-scope
	// root — so the live check above proves it looked, not only that it found nothing.
	it('reaches every in-scope root', () => {
		const hits = findMetaphorViolations(undefined, { bannedTerms: ['Legate'], allowList: [] })
		const reached = (root: string) => hits.some((v) => v.file.startsWith(`${root}/`))

		for (const root of [`${PKG}/src`, `${PKG}/.agents/spec`, `${PKG}/skills`, `${PKG}/agents`, '.agents/specs']) {
			expect(reached(root), root).toBe(true)
		}
	})
})
