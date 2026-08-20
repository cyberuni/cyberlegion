// Plugin manifests carry their own `version`, which nothing bumps on its own.
// Changesets only touches package.json files, so this runs from the `version` script
// to keep the manifests in step with the published `cyberlegion` npm package.
//
// Unlike a repo where the npm package root doubles as the plugin root, cyberlegion keeps
// the plugin in its own `plugins/cyberlegion` workspace member, so the manifests live
// there rather than beside the CLI package's package.json.
//
// Rewrites the version line textually rather than reserialising the JSON, so biome's
// formatting (tabs, inlined short arrays) survives untouched.
import { readFileSync, writeFileSync } from 'node:fs'

const SOURCE = 'packages/cyberlegion/package.json'
const MANIFESTS = ['.plugin/plugin.json', '.codex-plugin/plugin.json'].map((file) => `plugins/cyberlegion/${file}`)

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
