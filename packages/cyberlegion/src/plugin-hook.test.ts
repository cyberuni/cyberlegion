import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// spec:cyberlegion-plugin/mail-hook — the plugin ships the mail-surfacing hook, which runs the
// installed copy's own CLI through ${CLAUDE_PLUGIN_ROOT}, never npx.
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

	it("the SessionStart command runs the plugin's own CLI, never npx", () => {
		expect(hooks.SessionStart?.[0]?.hooks).toHaveLength(1)
		expect(hooks.SessionStart?.[0]?.hooks[0]?.type).toBe('command')
		expect(commandOf('SessionStart')).toBe(
			`node "\${CLAUDE_PLUGIN_ROOT}/bin/cyberlegion.mjs" mail hook --event SessionStart`,
		)
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
