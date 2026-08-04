#!/usr/bin/env node
// CLI entry for `check:metaphor-free` — the vocabulary-boundary guard. Prints each violation as
// `file:line:term` and exits non-zero when any is found; exits 0 clean. See
// .agents/spec/metaphor-free/README.md for the contract and ./metaphor-free.ts for the engine.

import { findMetaphorViolations } from './metaphor-free.js'

const violations = findMetaphorViolations()

if (violations.length > 0) {
	for (const v of violations) {
		console.error(`${v.file}:${v.line}:${v.term}`)
	}
	console.error(`check:metaphor-free found ${violations.length} violation(s)`)
	process.exit(1)
}

console.log('check:metaphor-free: clean')
