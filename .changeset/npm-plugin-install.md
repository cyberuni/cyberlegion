---
"cyberlegion": patch
---

The npm tarball is now a complete, installable agent plugin: it carries `plugin.json`, the
`.claude-plugin/` and `.codex-plugin/` manifests, `.plugin/pins.json`, `skills/`, `agents/`, and a
self-contained `dist/cli.mjs`, so a marketplace can install the plugin from npm instead of from git,
where the gitignored `dist/` left the CLI unable to start.
