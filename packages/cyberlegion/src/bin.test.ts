import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// An installed plugin is a copy of the package directory, not an npm install: no node_modules,
// and — for a directory or git marketplace source — whatever the checkout carries. These tests
// build that shape in a scratch directory, outside the workspace, so no hoisted node_modules can
// hide a missing inline or a missing file.
const PKG_DIR = fileURLToPath(new URL('..', import.meta.url))
const VERSION = (JSON.parse(readFileSync(join(PKG_DIR, 'package.json'), 'utf8')) as { version: string }).version

function installShape(files: string[]): string {
	const root = mkdtempSync(join(tmpdir(), 'cyberlegion-install-'))
	for (const file of files) {
		mkdirSync(join(root, file, '..'), { recursive: true })
		copyFileSync(join(PKG_DIR, file), join(root, file))
	}
	return root
}

function runBin(root: string, args: string[]) {
	return spawnSync('node', [join(root, 'bin', 'cyberlegion.mjs'), ...args], { cwd: root, encoding: 'utf8' })
}

describe('bin/cyberlegion.mjs at an install location', () => {
	it('runs from bin, dist/cli.mjs, and package.json alone', () => {
		const root = installShape(['bin/cyberlegion.mjs', 'dist/cli.mjs', 'package.json'])

		const res = runBin(root, ['--version'])

		expect(res.stderr).toBe('')
		expect(res.stdout.trim()).toBe(VERSION)
	})

	it('names the missing dist/cli.mjs and a way out instead of a raw module-not-found', () => {
		const root = installShape(['bin/cyberlegion.mjs', 'package.json'])

		const res = runBin(root, ['--version'])

		expect(res.status).not.toBe(0)
		expect(res.stderr).not.toContain('ERR_MODULE_NOT_FOUND')
		expect(res.stderr).toContain(join(root, 'dist', 'cli.mjs'))
		expect(res.stderr).toContain(`npx -y cyberlegion@${VERSION}`)
	})
})

// Claude Code puts a plugin's bin/ on the Bash tool's PATH, so the file name there is the command
// name. bin/cyberlegion is the extensionless twin of cyberlegion.mjs that makes a bare `cyberlegion`
// resolve in a session with no global install.
describe('bin/cyberlegion on PATH at an install location', () => {
	function runBare(root: string, args: string[], cwd: string) {
		const PATH = `${join(root, 'bin')}${delimiter}${process.env.PATH ?? ''}`
		return spawnSync('cyberlegion', args, { cwd, encoding: 'utf8', env: { ...process.env, PATH } })
	}

	it('a bare cyberlegion runs the shipped CLI from an unrelated working directory', () => {
		const root = installShape(['bin/cyberlegion', 'bin/cyberlegion.mjs', 'dist/cli.mjs', 'package.json'])
		const elsewhere = mkdtempSync(join(tmpdir(), 'cyberlegion-cwd-'))

		const res = runBare(root, ['--version'], elsewhere)

		expect(res.error).toBeUndefined()
		expect(res.stderr).toBe('')
		expect(res.stdout.trim()).toBe(VERSION)
	})

	it('arguments, output, and the exit code pass through the bare command unchanged', () => {
		const root = installShape(['bin/cyberlegion', 'bin/cyberlegion.mjs', 'dist/cli.mjs', 'package.json'])
		const args = ['no-such-command', '--and', 'a value']

		const bare = runBare(root, args, root)
		const direct = runBin(root, args)

		expect(bare.status).not.toBe(0)
		expect({ status: bare.status, stdout: bare.stdout, stderr: bare.stderr }).toEqual({
			status: direct.status,
			stdout: direct.stdout,
			stderr: direct.stderr,
		})
	})

	it('the package ships an executable bin/cyberlegion', () => {
		const { files } = JSON.parse(readFileSync(join(PKG_DIR, 'package.json'), 'utf8')) as { files: string[] }

		expect(statSync(join(PKG_DIR, 'bin', 'cyberlegion')).mode & 0o111).not.toBe(0)
		expect(files.some((entry) => entry === 'bin' || entry === 'bin/cyberlegion')).toBe(true)
	})
})

// cynapse is an optional peer (cyber-civitas decision 0001): a runtime-only install has no cynapse,
// and the commands that sync units into it must work, silently, without it.
describe('an install without cynapse', () => {
	it('an install without cynapse registers and closes a unit and writes no cynapse store', () => {
		const root = installShape(['bin/cyberlegion.mjs', 'dist/cli.mjs', 'package.json'])
		const hub = join(root, 'hub')
		const home = join(root, 'cynapse-home')
		const env: NodeJS.ProcessEnv = { ...process.env, CYNAPSE_HOME: home }
		for (const k of ['TMUX', 'TMUX_PANE', 'HERDR_ENV', 'HERDR_PANE_ID', 'CYBER_MUX', 'CYBER_MUX_PANE']) delete env[k]
		const run = (args: string[]) =>
			spawnSync('node', [join(root, 'bin', 'cyberlegion.mjs'), ...args, '--space', hub], {
				cwd: root,
				encoding: 'utf8',
				env,
			})

		const reg = run(['unit', 'register', '--harness', 'claude', '--handle', 'solo', '--format', 'json'])
		expect(reg.stderr).toBe('')
		expect(reg.status).toBe(0)
		const close = run(['unit', 'close', JSON.parse(reg.stdout).id, '--keep-worktree'])
		expect(close.status).toBe(0)
		expect(close.stderr).not.toContain('cynapse')
		expect(existsSync(join(home, 'cynapse.db'))).toBe(false)
	})
})
