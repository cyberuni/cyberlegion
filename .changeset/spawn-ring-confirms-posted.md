---
'cyberlegion': patch
---

`unit spawn` and `unit restart` now report `rung: true` only once the new session's harness has posted the first-turn doorbell, not merely once the text left the input box. A doorbell typed before a booting harness drew its input box used to vanish and still count as rung, so the session sat idle with its brief unread. The doorbell is now typed again when that happens, and reported as `rung: false` with a warning if it never lands.
