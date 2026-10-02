---
'cyberlegion': patch
---

The plugin now ships `bin/cyberlegion`, an extensionless twin of `bin/cyberlegion.mjs`. Claude Code puts a plugin's `bin/` on the Bash tool's PATH, so a bare `cyberlegion …` now runs the shipped CLI in any Claude Code session instead of failing with `command not found` when there is no global install.
