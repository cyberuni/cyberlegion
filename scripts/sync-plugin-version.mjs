// The canonical plugin manifest carries its own `version`, which nothing bumps on its own.
// Changesets only touches package.json files, so this runs from the `version` script
// to keep the manifest in step with the published `cyberlegion` npm package. The vendor
// manifests (`.claude-plugin/`, `.codex-plugin/`) are derived from it by
// `universal-plugin plugin build`, which the `version` script runs next.
//
// The npm package root doubles as the plugin root, so the manifest sits beside the
// package.json it takes its version from.
//
// The same move keeps the CLI pins the plugin publishes at that version: each skill's
// `npx -y cyberlegion@<version>` fallback line, the same fallback inside each skill's
// `scripts/cyberlegion.mjs` launcher, and the `cyberlegion` entry in
// `.plugin/pins.json` that `init-cyberlegion` reads. A skill states the flags and output of
// its own version, so a pin left behind hands an agent a CLI its text does not describe.
// With `--check` nothing is written: every stale pin is named on stderr and the exit code is
// non-zero, which is how the test suite keeps a hand edit from drifting a pin.
//
// Rewrites each version textually rather than reserialising JSON or Markdown, so biome's
// formatting (tabs, inlined short arrays) survives untouched.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const PACKAGE = 'packages/cyberlegion'
const SOURCE = join(PACKAGE, 'package.json')
const MANIFESTS = [join(PACKAGE, 'plugin.json')]
const PINS_MAP = join(PACKAGE, '.plugin', 'pins.json')
const SKILLS = join(PACKAGE, 'skills')

// Each pin's pattern captures its prefix as $1 and the version as $2. The manifest pattern is
// not global: only its own top-level `version` is the package version.
const MANIFEST_VERSION = { pattern: /("version":\s*")([^"]*)"/, all: false }
const MAP_PIN = { pattern: /("cyberlegion":\s*")([^"]*)"/, all: false }
const SKILL_PIN = { pattern: /(npx -y cyberlegion@)(\d+\.\d+\.\d+(?:-[\w.]+)?)/, all: true }

const check = process.argv.includes('--check')
const { version } = JSON.parse(readFileSync(SOURCE, 'utf8'))
if (!version) throw new Error(`no version field in ${SOURCE}`)

const skillFiles = readdirSync(SKILLS, { withFileTypes: true })
	.filter((entry) => entry.isDirectory())
	.flatMap((entry) => ['SKILL.md', join('scripts', 'cyberlegion.mjs')].map((file) => join(SKILLS, entry.name, file)))
	.filter((file) => existsSync(file))

// `--check` guards the pins an agent runs; the manifest is synced but left to
// `universal-plugin plugin build`, which owns what reads it.
const pins = [
	...(check ? [] : MANIFESTS.map((file) => ({ file, ...MANIFEST_VERSION }))),
	{ file: PINS_MAP, ...MAP_PIN },
	...skillFiles.map((file) => ({ file, ...SKILL_PIN })),
]

const stale = []
for (const { file, pattern, all } of pins) {
	const matcher = new RegExp(pattern.source, all ? 'g' : '')
	const before = readFileSync(file, 'utf8')
	const found = all ? [...before.matchAll(matcher)] : [before.match(matcher)].filter(Boolean)
	const behind = [...new Set(found.map((m) => m[2]).filter((v) => v !== version))]
	if (behind.length === 0) {
		if (!check) console.info(`${file} already at ${version}`)
		continue
	}
	if (check) {
		stale.push(`${file}: ${behind.join(', ')}`)
		continue
	}
	writeFileSync(
		file,
		before.replace(matcher, (whole, prefix, old) => whole.replace(prefix + old, prefix + version)),
	)
	console.info(`${file} -> ${version}`)
}

if (stale.length > 0) {
	console.error(`stale cyberlegion pins (package.json is ${version}); run node scripts/sync-plugin-version.mjs:`)
	for (const line of stale) console.error(`  ${line}`)
	process.exit(1)
}
