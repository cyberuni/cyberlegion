// Tests for the check:metaphor-free vocabulary-boundary guard.
//
// One test per frozen scenario in .agents/spec/metaphor-free/metaphor-free.feature (8 total, named
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
		writeFile('src/queue.ts', 'export function lockBunkerDoor() {}\n')

		const violations = findMetaphorViolations(root, { allowList: [] })

		expect(violations).toEqual([{ file: 'src/queue.ts', line: 1, term: 'Bunker' }])
	})

	it('a persona name in a spec document fails the guard', () => {
		writeFile('.agents/spec/widget/README.md', 'This module hands the request to the Pod for scheduling.\n')

		const violations = findMetaphorViolations(root, { allowList: [] })

		expect(violations).toEqual([{ file: '.agents/spec/widget/README.md', line: 1, term: 'Pod' }])
	})

	it('a lowercase generic word passes the guard', () => {
		writeFile('src/golf.ts', '// the ball landed in the bunker\n')

		const violations = findMetaphorViolations(root, { allowList: [] })

		expect(violations).toEqual([])
	})

	it('a word that merely contains a banned term passes the guard', () => {
		writeFile('src/roles.ts', 'class Councilor {}\n')

		const violations = findMetaphorViolations(root, { allowList: [] })

		expect(violations).toEqual([])
	})

	it('a sanctioned boundary reference passes the guard', () => {
		writeFile('.agents/spec/handoff/README.md', 'The fleet layer owns the Operator; this package stays generic.\n')

		const violations = findMetaphorViolations(root, {
			allowList: [
				{
					file: '.agents/spec/handoff/README.md',
					term: 'Operator',
					contains: 'owns the Operator; this package',
				},
			],
		})

		expect(violations).toEqual([])
	})

	it('a banned term recorded in provenance passes the guard', () => {
		writeFile(
			'.agents/spec/ledger/some-past-fix.abc123.jsonl',
			'{"why":"fixed the Council metaphor leak in the resolver"}\n',
		)

		const violations = findMetaphorViolations(root, { allowList: [] })

		expect(violations).toEqual([])
	})

	it("the guard's own defining document passes the guard", () => {
		writeFile('.agents/spec/metaphor-free/README.md', 'The banned terms are Bunker, Council, Operator, and Pod.\n')

		const violations = findMetaphorViolations(root, { allowList: [] })

		expect(violations).toEqual([])
	})

	it('a clean multi-file package passes the guard', () => {
		writeFile('src/a.ts', 'const owner = "Operator"\n')
		writeFile('.agents/spec/b/README.md', 'Handed off to the Pod for retries.\n')

		const violations = findMetaphorViolations(root, {
			allowList: [
				{ file: 'src/a.ts', term: 'Operator', contains: 'const owner = "Operator"' },
				{
					file: '.agents/spec/b/README.md',
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

// CI enforcement: run the guard over the REAL cyberlegion package on every test run, so a future
// unsanctioned persona leak fails `pnpm test` -> `pnpm verify` -> CI. This realizes the charter — the
// boundary is enforced by a script on every run, not re-discovered by a judge each mission. Distinct
// from the 8 synthetic per-scenario tests above: this one asserts the live tree, not a fixture.
describe('the live cyberlegion package stays metaphor-free', () => {
	it('has no unsanctioned capitalized persona name in any in-scope file', () => {
		const violations = findMetaphorViolations()
		expect(violations, JSON.stringify(violations, null, 2)).toEqual([])
	})
})
