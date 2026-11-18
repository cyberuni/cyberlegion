import { spawnSync } from 'node:child_process'
import {
	chmodSync,
	copyFileSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// spec:cyberlegion-plugin/cli-launcher — a skill runs the CLI its own plugin ships, through the
// skills/<skill>/scripts/cyberlegion.mjs forwarder universal-plugin writes from a forward entry. The
// installed-shape cases copy the package the way a plugin install does (no node_modules) into a scratch
// directory outside the workspace, so nothing hoisted can stand in for a missing file.
const PKG_DIR = fileURLToPath(new URL('..', import.meta.url))
const VERSION = (JSON.parse(readFileSync(join(PKG_DIR, 'package.json'), 'utf8')) as { version: string }).version
const FORWARDER = join('scripts', 'cyberlegion.mjs')

const skillNames = readdirSync(join(PKG_DIR, 'skills'))
const skillBody = (name: string) => readFileSync(join(PKG_DIR, 'skills', name, 'SKILL.md'), 'utf8')

const INVOCATION = /node scripts\/cyberlegion\.mjs|(?:npx|upx|pnpm exec)(?: -y)? cyberlegion\b/
const cliSkills = skillNames.filter((name) => INVOCATION.test(skillBody(name)))
const forwarderFiles = cliSkills.map((name) => join('skills', name, FORWARDER))

const manifest = JSON.parse(readFileSync(join(PKG_DIR, 'plugin.json'), 'utf8'))
const scripts: Record<string, unknown> = manifest.extensions['org.cyberuni.universal-plugin'].scripts

function installShape(files: string[]): string {
	const root = mkdtempSync(join(tmpdir(), 'cyberlegion-skill-'))
	for (const file of files) {
		mkdirSync(join(root, file, '..'), { recursive: true })
		copyFileSync(join(PKG_DIR, file), join(root, file))
	}
	return root
}

function run(script: string, args: string[], cwd: string, env: NodeJS.ProcessEnv = process.env) {
	return spawnSync('node', [script, ...args], { cwd, encoding: 'utf8', env })
}

/** The version a forwarder embeds in its __SKILL_SCRIPT__ header. */
function embeddedVersion(file: string): string | undefined {
	const header = readFileSync(file, 'utf8').match(/globalThis\.__SKILL_SCRIPT__ = (\{.*\});/)
	return header ? (JSON.parse(header[1]) as { version?: string }).version : undefined
}

describe('cli-launcher: a skill runs the CLI it ships with', () => {
	it('finds skills that run the CLI', () => {
		expect(cliSkills.length).toBeGreaterThan(0)
	})

	it.each(cliSkills)('%s ships a forwarder declared as a forward entry', (name) => {
		const file = join('skills', name, FORWARDER)
		expect(existsSync(join(PKG_DIR, file))).toBe(true)
		expect(scripts[file.split('\\').join('/')]).toEqual({ forward: 'cyberlegion' })
	})

	it('declares a forward entry only for skills that run the CLI', () => {
		expect(Object.keys(scripts).sort()).toEqual(forwarderFiles.map((f) => f.split('\\').join('/')).sort())
	})

	it.each(cliSkills)('%s runs every CLI command through its forwarder', (name) => {
		const body = skillBody(name)
		expect(body).toContain('node scripts/cyberlegion.mjs')
		expect(body).not.toMatch(/(?:npx|upx|pnpm exec)(?: -y)? cyberlegion\b/)
	})

	it('the forwarder finds the CLI from its own location, not the working directory', () => {
		const elsewhere = mkdtempSync(join(tmpdir(), 'cyberlegion-cwd-'))

		const res = run(join(PKG_DIR, forwarderFiles[0]), ['--version'], elsewhere)

		expect(res.status).toBe(0)
		expect(res.stdout.trim()).toBe(VERSION)
	})

	it.each(cliSkills)("%s's forwarder runs the shipped CLI from an installed-shape plugin directory", (name) => {
		const root = installShape([join('skills', name, FORWARDER), 'bin/cyberlegion.mjs', 'dist/cli.mjs', 'package.json'])
		const elsewhere = mkdtempSync(join(tmpdir(), 'cyberlegion-cwd-'))

		const res = run(join(root, 'skills', name, FORWARDER), ['--version'], elsewhere)

		expect(res.stderr).toBe('')
		expect(res.status).toBe(0)
		expect(res.stdout.trim()).toBe(VERSION)
	})

	it('passes arguments, output, and the exit code through unchanged', () => {
		const root = installShape([...forwarderFiles, 'bin/cyberlegion.mjs', 'dist/cli.mjs', 'package.json'])
		const args = ['mail', 'inbox', '--bogus']

		const viaForwarder = run(join(root, 'skills', cliSkills[0], FORWARDER), args, root)
		const viaBin = run(join(root, 'bin', 'cyberlegion.mjs'), args, root)

		expect(viaForwarder.status).not.toBe(0)
		expect({ stdout: viaForwarder.stdout, stderr: viaForwarder.stderr, status: viaForwarder.status }).toEqual({
			stdout: viaBin.stdout,
			stderr: viaBin.stderr,
			status: viaBin.status,
		})
	})

	it('a forwarder in a standalone skill folder runs the pinned published CLI', () => {
		// A stand-in npx first on PATH records what the forwarder asks for, with no network.
		const fakeBin = mkdtempSync(join(tmpdir(), 'cyberlegion-npx-'))
		const npx = join(fakeBin, 'npx')
		writeFileSync(npx, '#!/bin/sh\necho "npx $*"\nexit 7\n')
		chmodSync(npx, 0o755)
		const root = installShape([forwarderFiles[0]])
		const env = { ...process.env, PATH: `${fakeBin}${delimiter}${process.env.PATH ?? ''}` }

		const res = run(join(root, forwarderFiles[0]), ['unit', 'who', '--format', 'json'], root, env)

		expect(res.stdout.trim()).toBe(`npx -y cyberlegion@${VERSION} unit who --format json`)
		expect(res.status).toBe(7)
	})

	it('a forwarder at a checkout without the built CLI names it and the pinned fallback', () => {
		const root = installShape([forwarderFiles[0], 'bin/cyberlegion.mjs', 'package.json'])

		const res = run(join(root, forwarderFiles[0]), ['--version'], root)

		expect(res.status).not.toBe(0)
		expect(res.stderr).toContain(join('dist', 'cli.mjs'))
		expect(res.stderr).toContain(`npx -y cyberlegion@${VERSION}`)
		expect(res.stderr).not.toContain('ERR_MODULE_NOT_FOUND')
	})
})

describe('cli-launcher: every forwarder carries the shipped version', () => {
	it.each(cliSkills)("%s's forwarder embeds the plugin manifest's version", (name) => {
		expect(embeddedVersion(join(PKG_DIR, 'skills', name, FORWARDER))).toBe(manifest.version)
	})

	it.each(cliSkills)("%s's forwarder embeds the package version", (name) => {
		expect(embeddedVersion(join(PKG_DIR, 'skills', name, FORWARDER))).toBe(VERSION)
	})
})
