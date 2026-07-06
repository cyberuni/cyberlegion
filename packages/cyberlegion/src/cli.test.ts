import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Exercises the actual built CLI entrypoint (bin → dist/cli.mjs) end-to-end.
const BIN = fileURLToPath(new URL('../bin/cyberlegion.mjs', import.meta.url))

function legion(args: string[]): string {
	return execFileSync('node', [BIN, ...args], { encoding: 'utf8' })
}

describe('cli scaffold', () => {
	it('reports its version', () => {
		expect(legion(['--version']).trim()).toBe('0.0.0')
	})

	it('--help lists the six mechanism command groups', () => {
		const out = legion(['--help'])
		for (const group of ['identity', 'session', 'mail', 'dispatch', 'agent', 'admin']) {
			expect(out).toContain(group)
		}
	})
})
