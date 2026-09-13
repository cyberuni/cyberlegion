---
"cyberlegion": patch
---

Ship the agent plugin inside the npm package, and bundle the CLI's dependencies into `dist/cli.mjs`.

`plugin.json`, the generated `.claude-plugin/` and `.codex-plugin/` manifests, `.plugin/pins.json`,
`skills/`, and `agents/` now live in the package and are published with it.

An installed agent plugin is a copy of a source checkout, not an npm install, so its directory has
no reliable `node_modules`. `dist/cli.mjs` now inlines `commander` and `cyber-mux` and runs with no
`node_modules` present. The library entry keeps both external, so a consumer that also uses
cyber-mux shares one copy.
