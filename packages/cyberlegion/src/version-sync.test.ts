import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// spec:cyberlegion-plugin/cli-launcher — the release version flow keeps every skill's fallback pin
// and the plugin's .plugin/pins.json at the package version, and a stale pin fails the suite.
// The sync script runs from the repository root; each case lays out a scratch repository with the
// same relative paths.
const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url))
const SYNC = join(REPO_ROOT, 'scripts', 'sync-plugin-version.mjs')
const PKG = join('packages', 'cyberlegion')

function scratchRepo(version: string, pinned: string): string {
	const root = mkdtempSync(join(tmpdir(), 'cyberlegion-version-'))
	const write = (file: string, content: string) => {
		mkdirSync(join(root, file, '..'), { recursive: true })
		writeFileSync(join(root, file), content)
	}
	write(join(PKG, 'package.json'), JSON.stringify({ name: 'cyberlegion', version }, null, '\t'))
	write(join(PKG, 'plugin.json'), `{\n\t"name": "cyberlegion",\n\t"version": "${pinned}"\n}\n`)
	write(join(PKG, '.plugin', 'pins.json'), `{\n\t"cyberlegion": "${pinned}"\n}\n`)
	write(
		join(PKG, 'skills', 'alpha', 'SKILL.md'),
		`# alpha\n\n> fallback: \`npx -y cyberlegion@${pinned}\`.\n\n\`\`\`bash\nnode scripts/cyberlegion.mjs unit who\n\`\`\`\n`,
	)
	write(join(PKG, 'skills', 'beta', 'SKILL.md'), `# beta\n\nfallback: \`npx -y cyberlegion@${pinned}\`\n`)
	return root
}

const sync = (root: string, args: string[] = []) => spawnSync('node', [SYNC, ...args], { cwd: root, encoding: 'utf8' })
const read = (root: string, file: string) => readFileSync(join(root, PKG, file), 'utf8')

describe('the version flow keeps the CLI pins current', () => {
	it("rewrites every skill's fallback pin to the package version", () => {
		const root = scratchRepo('0.5.0', '0.3.1')

		expect(sync(root).status).toBe(0)

		expect(read(root, 'skills/alpha/SKILL.md')).toContain('`npx -y cyberlegion@0.5.0`')
		expect(read(root, 'skills/beta/SKILL.md')).toContain('`npx -y cyberlegion@0.5.0`')
		expect(read(root, 'skills/alpha/SKILL.md')).not.toContain('0.3.1')
	})

	it("rewrites the plugin's pins map to the package version", () => {
		const root = scratchRepo('0.5.0', '0.3.1')

		expect(sync(root).status).toBe(0)

		expect(JSON.parse(read(root, '.plugin/pins.json'))).toEqual({ cyberlegion: '0.5.0' })
	})

	it('fails the check naming each stale pin', () => {
		const root = scratchRepo('0.5.0', '0.3.1')

		const res = sync(root, ['--check'])

		expect(res.status).not.toBe(0)
		expect(res.stderr).toContain(join(PKG, 'skills', 'alpha', 'SKILL.md'))
		expect(res.stderr).toContain(join(PKG, 'skills', 'beta', 'SKILL.md'))
		expect(res.stderr).toContain(join(PKG, '.plugin', 'pins.json'))
		expect(res.stderr).toContain('0.3.1')
		// --check reports; it never rewrites.
		expect(read(root, 'skills/alpha/SKILL.md')).toContain('cyberlegion@0.3.1')
	})

	it('passes the check when every pin matches the package version', () => {
		const root = scratchRepo('0.5.0', '0.5.0')

		const res = sync(root, ['--check'])

		expect(res.stderr).toBe('')
		expect(res.status).toBe(0)
	})

	it("this repository's pins match its package version", () => {
		const res = sync(REPO_ROOT, ['--check'])

		expect(res.stderr).toBe('')
		expect(res.status).toBe(0)
	})
})
