import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Exercises the actual built CLI entrypoint (bin → dist/cli.mjs) end-to-end.
const BIN = fileURLToPath(new URL('../bin/cyberlegion.mjs', import.meta.url))

function legion(args: string[]): string {
	return execFileSync('node', [BIN, ...args], { encoding: 'utf8' })
}

describe('cli scaffold', () => {
	it('reports the version its own manifest declares, never a placeholder', () => {
		// Asserted against the manifest rather than a literal: pinning the literal is what let a
		// hardcoded `VERSION = '0.0.0'` ship green for five releases. The placeholder guard is the
		// half that fails loud if the read is ever replaced by a constant again.
		const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
			version: string
		}

		const reported = legion(['--version']).trim()

		expect(reported).toBe(manifest.version)
		expect(reported).not.toBe('0.0.0')
	})

	it('--help lists the mechanism command groups', () => {
		const out = legion(['--help'])
		for (const group of ['mux', 'unit', 'mail', 'agent', 'attach', 'init', 'admin']) {
			expect(out).toContain(group)
		}
	})
})
