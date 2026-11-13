---
"cyberlegion": patch
---

`unit prune` keeps an exited unit that only shares a worktree while it is the last record pointing at that worktree, the worktree is still on disk, and its work has not landed. Before, prune deleted it and left the work with nothing pointing at it. "Landed" is the worktree library's judgment (clean, and its branch landed on the default branch), exported as `landedWorktrees` for library callers to pass to `prune`; without it, `prune` keeps every such record.
