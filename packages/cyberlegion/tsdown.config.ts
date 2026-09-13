import { defineConfig } from 'tsdown'

// Two configs, because the entries want opposite dependency treatment. They share an
// `outDir`, which is safe: tsdown hoists `clean` and runs it once across every config
// before any build writes, so neither wipes the other.
const shared = {
	outDir: 'dist',
	format: 'esm',
	platform: 'node',
	clean: true,
} as const

export default defineConfig([
	{
		// Library entry. Dependencies stay EXTERNAL on purpose: `cyber-mux` types surface in the
		// public `.d.mts`, and a consumer that also uses cyber-mux must share one copy rather than
		// get a private inlined duplicate.
		...shared,
		entry: { index: 'src/index.ts' },
		dts: true,
	},
	{
		// CLI entry. Every runtime dependency is inlined so `dist/cli.mjs` runs with no
		// `node_modules` present — which is the state an installed agent plugin is actually in,
		// since the plugin directory is a copy of the source checkout rather than an npm install.
		//
		// `bin/cyberlegion.mjs` imports this file and calls `runCli`, so `dts` buys nothing here.
		//
		// Regexes rather than bare names because `cyber-mux` is imported by subpath too
		// (`cyber-mux/worktree`). Only this package's own `dependencies` need listing — those are
		// the only ones tsdown externalizes by default, so anything they pull in transitively is
		// inlined automatically. `onlyBundle: false` silences the "bundled a dependency" warnings
		// that are the whole point here.
		...shared,
		entry: { cli: 'src/cli.ts' },
		dts: false,
		deps: {
			alwaysBundle: [/^commander(\/|$)/, /^cyber-mux(\/|$)/],
			onlyBundle: false,
		},
	},
])
