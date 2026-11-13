---
'cyberlegion': major
---

`unit prune` now deletes every exited unit with no worktree on disk: its record, brief, mailbox, and the pane pointer that still names it. An exited unit whose worktree is still on disk is kept for `unit close`, and a stopped unit is never touched. Each pruned row now says whether the unit was `exited` or `deleted`.

`unit restart` no longer revives an exited unit; it takes only a running or stopped one. Spawn a new unit instead, or `unit rebind` a session resumed by hand. `unit show` no longer offers `restart` for an exited unit.
