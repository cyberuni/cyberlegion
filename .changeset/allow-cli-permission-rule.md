---
"cyberlegion": minor
---

`cyberlegion init --allow-cli` adds `Bash(cyberlegion *)` to Claude Code's user `permissions.allow` (`~/.claude/settings.json`, or `$CLAUDE_CONFIG_DIR/settings.json`). It appends the rule to the existing list, writes nothing when a covering rule is already there, and refuses to rewrite a settings file it cannot parse. Without the rule, Claude Code's auto-mode classifier can deny a unit's `cyberlegion mail send` as an external write, so the unit cannot report back. `mux doctor` and `init` on Claude Code now report the rule as `present`, `missing`, or `unreadable`, and suggest `init --allow-cli` when it is missing.
