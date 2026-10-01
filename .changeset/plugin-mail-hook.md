---
"cyberlegion": minor
---

The mail-surfacing hook now runs the CLI the session was installed with, never one `npx` resolves from the registry when the hook fires (#69). The plugin ships its own `hooks/hooks.json` for Claude Code and Codex, running `node "${CLAUDE_PLUGIN_ROOT}/bin/cyberlegion.mjs" mail hook`, so the hook runs offline at the enabled version. On those harnesses `cyberlegion init` writes no project hook, removes one an earlier `init` wrote, and reports `provided by plugin` or `removed project hook`. On Cursor, `init` registers a hook that runs a `cyberlegion` on `PATH` first and falls back to `npx -y cyberlegion[@<pin>]` only when there is none.
