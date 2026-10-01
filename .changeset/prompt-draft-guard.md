---
'cyberlegion': minor
---

Ringing a peer no longer types over a human's unsent draft. The `mail send` doorbell, the spawn first-turn doorbell, `unit nudge`, and `unit clear` first read the peer's input box (Claude Code, Codex, cursor-agent). A draft being edited is waited out; a draft left unchanged for 20 seconds is cleared, the ring is sent, and the draft is typed back unsent. A draft that keeps changing for 60 seconds, or an idle draft spanning several rows, is left alone and the ring is skipped: the doorbell reports a warning, and `unit nudge`/`unit clear` fail.
