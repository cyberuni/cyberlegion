import { spawnSync } from 'node:child_process'
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// spec:cyberlegion-plugin/mail-hook — the plugin ships the mail-surfacing hook, which runs a spawned
// unit's spawner CLI ($CYBERLEGION_CLI) or else the installed copy's own CLI through
// ${CLAUDE_PLUGIN_ROOT}, never npx.
const PKG_DIR = fileURLToPath(new URL('..', import.meta.url))
const readJson = (rel: string) => JSON.parse(readFileSync(join(PKG_DIR, rel), 'utf8'))

interface HookGroup {
	matcher?: string
	hooks: { type: string; command: string }[]
}
const hooks = readJson('hooks/hooks.json').hooks as Record<string, HookGroup[]>
const commandOf = (event: string) => hooks[event]?.[0]?.hooks[0]?.command ?? ''

describe('mail-hook: the plugin ships the surfacing hook', () => {
	it('registers SessionStart only, with no PostToolUse', () => {
		expect(Object.keys(hooks)).toEqual(['SessionStart'])
		expect(hooks.SessionStart).toHaveLength(1)
	})

	it("the SessionStart command prefers CYBERLEGION_CLI, else the plugin's own CLI, never npx", () => {
		expect(hooks.SessionStart?.[0]?.hooks).toHaveLength(1)
		expect(hooks.SessionStart?.[0]?.hooks[0]?.type).toBe('command')
		expect(commandOf('SessionStart')).toBe(
			`if [ -x "$CYBERLEGION_CLI" ]; then "$CYBERLEGION_CLI" mail hook --event SessionStart; else node "\${CLAUDE_PLUGIN_ROOT}/bin/cyberlegion.mjs" mail hook --event SessionStart; fi`,
		)
		expect(commandOf('SessionStart')).not.toMatch(/npx/)
	})

	// A spawned unit's launch names the spawner's CLI shim in $CYBERLEGION_CLI (unit/lifecycle). The
	// hook prefers it over the plugin's own copy, and falls back when it is unset or not executable.
	describe('which CLI the SessionStart command runs', () => {
		const run = (env: NodeJS.ProcessEnv) =>
			spawnSync('sh', ['-c', commandOf('SessionStart')], { encoding: 'utf8', env: { PATH: process.env.PATH, ...env } })
		const fakeCli = (dir: string, name: string) => {
			const file = join(dir, name)
			writeFileSync(file, `#!/bin/sh\necho ${name} "$@"\n`)
			chmodSync(file, 0o755)
			return file
		}
		const pluginRoot = () => {
			const root = mkdtempSync(join(tmpdir(), 'cyberlegion-plugin-'))
			mkdirSync(join(root, 'bin'))
			writeFileSync(join(root, 'bin/cyberlegion.mjs'), 'console.log("plugin", ...process.argv.slice(2))')
			return root
		}

		it("runs the spawner's CLI named in CYBERLEGION_CLI", () => {
			const shim = fakeCli(mkdtempSync(join(tmpdir(), 'cl-shim-')), 'spawner')
			const res = run({ CLAUDE_PLUGIN_ROOT: pluginRoot(), CYBERLEGION_CLI: shim })
			expect(res.stdout.trim()).toBe('spawner mail hook --event SessionStart')
		})

		it("runs the plugin's own CLI when CYBERLEGION_CLI is unset, even with another cyberlegion on PATH", () => {
			const stale = mkdtempSync(join(tmpdir(), 'cl-global-'))
			fakeCli(stale, 'cyberlegion')
			const res = run({ CLAUDE_PLUGIN_ROOT: pluginRoot(), PATH: `${stale}:${process.env.PATH}` })
			expect(res.stdout.trim()).toBe('plugin mail hook --event SessionStart')
		})

		it("runs the plugin's own CLI when CYBERLEGION_CLI names no executable file", () => {
			const gone = join(mkdtempSync(join(tmpdir(), 'cl-pruned-')), 'cyberlegion')
			const res = run({ CLAUDE_PLUGIN_ROOT: pluginRoot(), CYBERLEGION_CLI: gone })
			expect(res.stdout.trim()).toBe('plugin mail hook --event SessionStart')
		})
	})

	it.each(['plugin.json', '.claude-plugin/plugin.json', '.codex-plugin/plugin.json'])(
		'%s names the hook file',
		(manifest) => {
			const json = readJson(manifest)
			const field = manifest === 'plugin.json' ? json.extensions['org.cyberuni.universal-plugin'].hooks : json.hooks
			expect(field).toBe('./hooks/hooks.json')
		},
	)

	it('runs from an installed-shape plugin directory with no node_modules', () => {
		const root = mkdtempSync(join(tmpdir(), 'cyberlegion-plugin-'))
		for (const file of ['bin/cyberlegion.mjs', 'dist/cli.mjs', 'hooks/hooks.json', 'package.json']) {
			mkdirSync(join(root, file, '..'), { recursive: true })
			copyFileSync(join(PKG_DIR, file), join(root, file))
		}
		const hub = mkdtempSync(join(tmpdir(), 'cyberlegion-hub-'))
		const base: NodeJS.ProcessEnv = { PATH: process.env.PATH, HOME: hub, CYBERLEGION_ROOT: hub }
		// A payload-bearing caller: the hook prints nothing when there is nothing to surface.
		const cli = (args: string[]) =>
			spawnSync('node', [join(root, 'bin/cyberlegion.mjs'), ...args], { encoding: 'utf8', env: base }).stdout
		cli(['unit', 'register', '--harness', 'claude', '--handle', 'alice'])
		cli(['unit', 'register', '--harness', 'claude', '--handle', 'bob'])
		const who = JSON.parse(cli(['unit', 'who', '--format', 'json'])) as { id: string; handle: string }[]
		const id = (handle: string) => who.find((a) => a.handle === handle)?.id ?? ''
		cli(['mail', 'send', '--from', id('bob'), '--to', 'alice', '--body', 'ping', '--no-nudge'])

		const env = { ...base, CLAUDE_PLUGIN_ROOT: root, CYBERLEGION_AGENT_ID: id('alice') }
		const res = spawnSync('sh', ['-c', commandOf('SessionStart')], { cwd: hub, encoding: 'utf8', env })
		expect(res.stderr).not.toMatch(/ERR_MODULE_NOT_FOUND/)
		expect(res.status).toBe(0)
		expect(JSON.parse(res.stdout).hookSpecificOutput.hookEventName).toBe('SessionStart')
		expect(res.stdout).toContain('ping')
	})
})
