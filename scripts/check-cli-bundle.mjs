// The plugin's marketplace entry installs from the repo, not the npm tarball, and no harness runs a
// build after it copies a plugin directory. So `packages/cyberlegion/dist/cli.mjs` is committed: it
// is the file `bin/cyberlegion.mjs` runs at a source install. A committed build artifact is only
// worth having if it matches the source, so this runs after a build and fails when the build
// changed the tracked copy — in CI (`pnpm verify`) and before a commit (`.husky/pre-commit`).
import { execFileSync } from 'node:child_process'

const BUNDLE = 'packages/cyberlegion/dist/cli.mjs'

function git(args) {
	return execFileSync('git', args, { encoding: 'utf8' })
}

if (git(['ls-files', '--', BUNDLE]).trim() === '') {
	console.error(`${BUNDLE} is not tracked — a source install of the plugin would have no CLI.`)
	process.exit(1)
}

// Worktree against index, not against HEAD: a rebuilt copy already staged for this commit is fresh.
if (git(['diff', '--name-only', '--', BUNDLE]).trim() !== '') {
	console.error(`${BUNDLE} is stale: the build changed it. Stage the rebuilt file and commit it:`)
	console.error(`  git add ${BUNDLE}`)
	process.exit(1)
}
