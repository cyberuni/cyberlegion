---
"cyberlegion": minor
---

`mail inbox --unit <handle|id>` lists another unit's mail without acking it and without the caller taking that unit's identity. Exited units resolve too, so a cleanup sweep can check whether a dead unit left unread mail without reading the hub's files itself. The output carries a `mailbox` state of `none` (no mail was ever delivered), `present`, or `unreadable`. An unreadable mailbox exits 1, so a caller never reads it as empty.
