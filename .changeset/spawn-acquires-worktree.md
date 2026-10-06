---
"cyberlegion": minor
---

`unit spawn` now leases its worktree from the worktree library (`@cyberuni/agent-harness/worktrees`) instead of making a fresh checkout per unit. An idle worktree a closed unit released is recycled onto the new unit's branch, and a new one is created only when none is idle, at the library's slot path `<parent>/<repo>.worktrees/<repo>-<n>` (it was `legion-<id6>`). The lease is git's own lock on the worktree, and the spawn output reports whether the worktree was `reused`.

`unit close` releases a leased worktree instead of removing it, so the next spawn can recycle it. Release removes nothing, so it does not refuse uncommitted changes, and a dirty worktree is not recycled. A lease someone took away is reported as `lost`, and the close still completes. The output gains a `lease` field.

A spawn with `--worktree-path` bypasses the library: it holds no lease, and `close` removes its worktree as before. So does a unit spawned by an earlier version.
