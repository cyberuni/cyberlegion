---
"cyberlegion": minor
---

Drop the PostToolUse mail hook. The plugin's `hooks/hooks.json` now fires on SessionStart only, and `mail hook` rejects `--event PostToolUse`. The hook re-injected every unread message on every Write/Edit, which cost more than the mid-turn latency it saved: the `mail send` doorbell already rings a busy unit's pane. `cyberlegion init` removes a PostToolUse project hook an earlier `init` wrote for Claude Code or Codex, so re-run it if your project config still has one.
