---
'cyberlegion': patch
---

`unit register` now records the repository's primary checkout (`worktree.primaryRoot`) alongside the worktree root and branch, as `unit spawn` does, so `unit focus --repo` finds a registered unit in a linked worktree by the repository's name. Re-registering fills in the primary root on an older record that lacks one.
