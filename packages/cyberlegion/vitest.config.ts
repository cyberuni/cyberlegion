import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
	test: {
		include: ['src/**/*.test.ts'],
		// cynapse is a dev dependency here, so every command that syncs units writes to the cynapse
		// store — and the CLI the e2e suites spawn inherits this env. Point it at a throwaway home so no
		// test ever registers participants in the developer's real `~/.cynapse`.
		// cyber-mux records a jump in its state file on every adapter focus when TMUX_PANE is set, and a
		// test run inside tmux inherits it. Point that state at a throwaway dir too, so no test writes
		// the developer's real `~/.agents/cyber-mux/jumps.json`.
		env: {
			CYNAPSE_HOME: mkdtempSync(join(tmpdir(), 'cl-cynapse-')),
			CYBER_MUX_STATE_DIR: mkdtempSync(join(tmpdir(), 'cl-cyber-mux-')),
		},
	},
})
