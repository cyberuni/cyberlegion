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
		env: { CYNAPSE_HOME: mkdtempSync(join(tmpdir(), 'cl-cynapse-')) },
	},
})
