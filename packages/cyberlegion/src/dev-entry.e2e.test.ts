import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

// `pnpm cl dev` is AGENTS.md's documented way to run the CLI from source. It went silent once:
// `src/cli.ts` became a module that exports `runCli` without calling it, while the `dev` script
// still ran that file directly, so every command exited 0 with no output. Running the script
// through pnpm, exactly as a developer types it, is what catches a script pointed at a file
// that defines the program but never parses argv.
const PKG_DIR = fileURLToPath(new URL('..', import.meta.url))

it('pnpm run dev --help prints the CLI usage', () => {
	const res = spawnSync('pnpm', ['run', '--silent', 'dev', '--help'], { cwd: PKG_DIR, encoding: 'utf8' })
	expect(res.status).toBe(0)
	expect(res.stdout).toMatch(/^Usage: cyberlegion /m)
}, 30_000)
