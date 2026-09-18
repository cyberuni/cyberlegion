#!/usr/bin/env node
// Runs the SDD spec gate's `.feature` form check over this repo's spec trees.
//
// The check itself is not ours — it ships as `check-suite.mts` inside the installed
// `cyber-sdd` skill, which imports the `gherkin-cli` parser. A skill copy with no
// node_modules beside it cannot resolve that parser, so the gate fell back to hand-
// checking and said nothing: a gate read as fully checked when one of its checks had
// never executed (issue #26). Pinning `cyber-sdd` as a devDependency of this repo makes
// the check runnable from here, and this wrapper makes a skip impossible to miss — every
// way the check can fail to run exits non-zero, and `pnpm verify` runs it.
//
// The success marker is asserted, not assumed. Exit 0 alone is not proof the check ran:
// the upstream script only drives its CLI when it is the process entry point, so a future
// change to that guard could make it load and exit 0 having checked nothing. Requiring the
// marker turns that silent pass back into a loud failure.

import { spawnSync } from 'node:child_process'
import { readdirSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

// Both spec trees this repo carries: the plugin's project spec and the CLI's.
const SPEC_ROOTS = ['.agents/specs', 'packages/cyberlegion/.agents/spec']

const SUCCESS_MARKER = 'suite checks OK'

function fail(reason) {
	console.error(`✗ suite check did not run: ${reason}`)
	console.error('  This is a hard failure on purpose — a spec gate must never skip this check silently.')
	process.exit(1)
}

const require = createRequire(import.meta.url)

let checker
try {
	checker = join(dirname(require.resolve('cyber-sdd/package.json')), 'skills/spec-gate/scripts/check-suite.mts')
} catch {
	fail('cannot resolve the `cyber-sdd` skill package — run `pnpm install`')
}

// The skill ships TypeScript, and node refuses to strip types under node_modules, so the
// checker runs under tsx rather than bare node.
const tsx = require.resolve('tsx/cli')

// A root that has been moved or renamed is not an empty corpus — the upstream checker
// reports a missing directory as zero suites and passes, which is the same silent skip in
// another costume. Require every declared root to exist and to hold at least one suite.
function countFeatures(dir) {
	let total = 0
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		if (entry.isDirectory()) total += countFeatures(join(dir, entry.name))
		else if (entry.name.endsWith('.feature')) total += 1
	}
	return total
}

let failed = false
for (const root of SPEC_ROOTS) {
	try {
		if (!statSync(root).isDirectory()) throw new Error('not a directory')
	} catch {
		fail(`${root}: declared spec root is missing — update SPEC_ROOTS in this script`)
	}
	if (countFeatures(root) === 0) fail(`${root}: declared spec root holds no .feature file`)
	const run = spawnSync(process.execPath, [tsx, checker, '--root', root], { encoding: 'utf8' })
	if (run.error) fail(`${root}: could not start the checker — ${run.error.message}`)
	process.stderr.write(run.stderr ?? '')
	if (run.status === 1 && (run.stdout ?? '').length === 0 && !(run.stderr ?? '').includes('✗')) {
		fail(`${root}: the checker exited 1 without reporting a violation`)
	}
	if (run.status !== 0) {
		failed = true
		continue
	}
	if (!(run.stdout ?? '').includes(SUCCESS_MARKER)) {
		fail(`${root}: the checker exited 0 without its "${SUCCESS_MARKER}" marker`)
	}
	process.stdout.write(`${SUCCESS_MARKER}: ${root}\n`)
}

process.exit(failed ? 1 : 0)
