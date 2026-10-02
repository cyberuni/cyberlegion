---
"cyberlegion": patch
---

`mail hook` no longer appends a `## Legion setup` nudge to a root session's payload. It fired in every root session on a hub whose owner is a claimed presence rather than a bound main pane, and it named `cyberlegion init` for a pane binding `init` does not do. The payload now carries only the caller's own unread mail and the standing owners' unread mail; onboarding stays with the `init-cyberlegion` skill.
