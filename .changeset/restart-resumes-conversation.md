---
"cyberlegion": minor
---

`unit restart` resumes a claude or codex unit's last conversation instead of always starting an empty session. The SessionStart hook (`mail hook`) now records the harness's session id on the unit each time a session starts in its pane, and restart relaunches with `claude --resume <id>` or `codex resume <id>`, ringing the session to continue its work. If the harness rejects the id, the plain launch runs instead. Cursor units, units with no recorded session, units launched through a wrapper command, and `unit restart --fresh` still get an empty session and a rebrief. The restart result gains a `resumed` field.
