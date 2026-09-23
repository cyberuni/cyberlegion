#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))
const cli = join(dir, '..', 'dist', 'cli.mjs')

// A plugin installed from a source checkout carries whatever the checkout carries, and no install
// step runs after the copy. Without the built CLI, a bare import dies with ERR_MODULE_NOT_FOUND and
// no way forward; say what is missing and name the exact published version that runs instead.
if (!existsSync(cli)) {
	const { version } = JSON.parse(readFileSync(join(dir, '..', 'package.json'), 'utf8'))
	process.stderr.write(
		`cyberlegion: the built CLI is missing: ${cli}\n` +
			'This install has no dist/ — it is a source checkout that was never built.\n' +
			`Run the published CLI of the same version instead: npx -y cyberlegion@${version}\n` +
			`Or build it in place: pnpm install && pnpm build (in ${join(dir, '..')})\n`,
	)
	process.exit(1)
}

const { runCli } = await import(cli)
await runCli()
