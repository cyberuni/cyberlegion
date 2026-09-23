#!/usr/bin/env node
// Runs the cyberlegion CLI this plugin ships, so the skill beside it never fetches a copy through npx.
// The package root is three levels up from this file (skills/<skill>/scripts/), resolved from the
// file's own location: the working directory is the repository the agent is working on, not the plugin.
// Arguments, output, and the exit code pass straight through the package's bin.
await import(new URL('../../../bin/cyberlegion.mjs', import.meta.url).href)
