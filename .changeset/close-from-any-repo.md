---
'cyberlegion': patch
---

`unit close` now removes a unit's worktree whatever directory it is run from. It found the repository from the caller's directory, so a close run from another repository asked the wrong repository to remove the worktree and aborted. The repository now comes from the worktree itself, and `unit spawn` records it on the unit, so a close whose worktree directory is already gone runs `git worktree prune` there and clears the registration git kept.
