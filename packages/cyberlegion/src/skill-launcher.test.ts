import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// spec:cyberlegion-plugin/cli-launcher — a skill runs the CLI its own plugin ships, through
// skills/<skill>/scripts/cyberlegion.mjs. The installed-shape cases copy the package the way a plugin
// install does (no node_modules) into a scratch directory outside the workspace, so nothing hoisted
// can stand in for a missing file.
const PKG_DIR = fileURLToPath(new URL('..', import.meta.url))
const VERSION = (JSON.parse(readFileSync(join(PKG_DIR, 'package.json'), 'utf8')) as { version: string }).version
const LAUNCHER = join('scripts', 'cyberlegion.mjs')

const skillNames = readdirSync(join(PKG_DIR, 'skills'))
const skillBody = (name: string) => readFileSync(join(PKG_DIR, 'skills', name, 'SKILL.md'), 'utf8')

const INVOCATION = /node scripts\/cyberlegion\.mjs|npx(?: -y)? cyberlegion\b/
const cliSkills = skillNames.filter((name) => INVOCATION.test(skillBody(name)))

function installShape(files: string[]): string {
	const root = mkdtempSync(join(tmpdir(), 'cyberlegion-skill-'))
	for (const file of files) {
		mkdirSync(join(root, file, '..'), { recursive: true })
		copyFileSync(join(PKG_DIR, file), join(root, file))
	}
	return root
}

const launcherFiles = cliSkills.map((name) => join('skills', name, LAUNCHER))

function run(script: string, args: string[], cwd: string) {
	return spawnSync('node', [script, ...args], { cwd, encoding: 'utf8' })
}

describe('cli-launcher: a skill runs the CLI it ships with', () => {
	it('finds skills that run the CLI', () => {
		expect(cliSkills.length).toBeGreaterThan(0)
	})

	it.each(cliSkills)('%s ships a launcher', (name) => {
		expect(existsSync(join(PKG_DIR, 'skills', name, LAUNCHER))).toBe(true)
	})

	it.each(cliSkills)('%s runs every CLI command through its launcher', (name) => {
		const body = skillBody(name)
		expect(body).toContain('node scripts/cyberlegion.mjs')
		const npx = body.match(/npx(?: -y)? cyberlegion(?:@[\w.<>-]+)?/g) ?? []
		if (name === 'init-cyberlegion') {
			// Its fallback version comes from .plugin/pins.json (the init node's frozen suite), so it names
			// the pinned form only as a placeholder and never a literal version.
			for (const form of npx) expect(form).toMatch(/^npx -y cyberlegion(?:@<version>)?$/)
		} else {
			expect(npx).toEqual([`npx -y cyberlegion@${VERSION}`])
		}
	})

	it.each(cliSkills)("%s's script runs from a skill folder copied on its own", (name) => {
		// The script is a compiled, self-contained file: nothing beside it (no bin/, no dist/, no
		// package.json, no node_modules) is needed, because a skill can be linked or copied alone.
		const root = installShape([join('skills', name, LAUNCHER)])
		const elsewhere = mkdtempSync(join(tmpdir(), 'cyberlegion-cwd-'))

		const res = run(join(root, 'skills', name, LAUNCHER), ['--version'], elsewhere)

		expect(res.stderr).toBe('')
		expect(res.status).toBe(0)
		expect(res.stdout.trim()).toBe(VERSION)
	})

	it.each(cliSkills)('%s reaches nothing outside its skill folder and carries no TypeScript', (name) => {
		const code = readFileSync(join(PKG_DIR, 'skills', name, LAUNCHER), 'utf8')
		expect(code).not.toMatch(/\.\.\/\.\.\//)
		expect(code).not.toMatch(/bin\/cyberlegion\.mjs/)
		expect(code).not.toMatch(/from\s+['"][^'"]+\.tsx?['"]/)
	})

	it('declares every launcher as a script entry built from src', () => {
		const manifest = JSON.parse(readFileSync(join(PKG_DIR, 'plugin.json'), 'utf8'))
		const scripts: Record<string, string> = manifest.extensions['org.cyberuni.universal-plugin'].scripts
		expect(Object.keys(scripts).sort()).toEqual(launcherFiles.map((f) => f.split('\\').join('/')).sort())
		for (const source of Object.values(scripts)) expect(existsSync(join(PKG_DIR, source))).toBe(true)
	})

	it('passes arguments, output, and the exit code through unchanged', () => {
		const root = installShape([...launcherFiles, 'bin/cyberlegion.mjs', 'dist/cli.mjs', 'package.json'])
		const args = ['mail', 'inbox', '--bogus']

		const viaLauncher = run(join(root, 'skills', cliSkills[0], LAUNCHER), args, root)
		const viaBin = run(join(root, 'bin', 'cyberlegion.mjs'), args, root)

		expect(viaLauncher.status).not.toBe(0)
		expect({ stdout: viaLauncher.stdout, stderr: viaLauncher.stderr, status: viaLauncher.status }).toEqual({
			stdout: viaBin.stdout,
			stderr: viaBin.stderr,
			status: viaBin.status,
		})
	})
})
