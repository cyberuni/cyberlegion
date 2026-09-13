// The canonical plugin manifest carries its own `version`, which nothing bumps on its own.
// Changesets only touches package.json files, so this runs from the `version` script
// to keep the manifest in step with the published `cyberlegion` npm package. The vendor
// manifests (`.claude-plugin/`, `.codex-plugin/`) are derived from it by
// `universal-plugin plugin build`, which the `version` script runs next.
//
// The npm package root doubles as the plugin root, so the manifest sits beside the
// package.json it takes its version from.
//
// Rewrites the version line textually rather than reserialising the JSON, so biome's
// formatting (tabs, inlined short arrays) survives untouched.
import { readFileSync, writeFileSync } from 'node:fs'

const SOURCE = 'packages/cyberlegion/package.json'
const MANIFESTS = ['packages/cyberlegion/plugin.json']

const { version } = JSON.parse(readFileSync(SOURCE, 'utf8'))
if (!version) throw new Error(`no version field in ${SOURCE}`)

for (const file of MANIFESTS) {
	const before = readFileSync(file, 'utf8')
	const after = before.replace(/("version":\s*)"[^"]*"/, `$1"${version}"`)
	if (after === before) {
		console.info(`${file} already at ${version}`)
		continue
	}
	writeFileSync(file, after)
	console.info(`${file} -> ${version}`)
}
