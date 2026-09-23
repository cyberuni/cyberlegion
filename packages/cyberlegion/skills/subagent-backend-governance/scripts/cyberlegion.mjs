#!/usr/bin/env node
// Runs the cyberlegion CLI this plugin ships, so the skill beside it never fetches a copy through npx.
// The package root is three levels up from this file (skills/<skill>/scripts/), resolved from the
// file's own location: the working directory is the repository the agent is working on, not the plugin.
// Arguments, output, and the exit code pass straight through the package's bin.
//
// A skill folder installed on its own has no package around it. Then this runs the published CLI of
// the version that shipped the skill instead, so the skill still works, only slower. The version sync
// run at release keeps FALLBACK at the package version.
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const FALLBACK = 'npx -y cyberlegion@0.4.0'
const bin = new URL('../../../bin/cyberlegion.mjs', import.meta.url)

if (existsSync(fileURLToPath(bin))) {
	await import(bin.href)
} else {
	process.stderr.write(`cyberlegion: no plugin package around this skill; running ${FALLBACK}\n`)
	const [command, ...args] = FALLBACK.split(' ')
	const res = spawnSync(command, [...args, ...process.argv.slice(2)], {
		stdio: 'inherit',
		shell: process.platform === 'win32',
	})
	if (res.error) {
		process.stderr.write(`cyberlegion: could not run ${FALLBACK}: ${res.error.message}\n`)
		process.exit(1)
	}
	process.exit(res.status ?? 1)
}
