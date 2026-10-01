---
"cyberlegion": patch
---

`unit close` no longer demands `--force` for a finished unit whose only change is the `.agents/cyberlegion/config.json` marker spawn stamped into its worktree, and `unit close --force` now has a real-git test proving it removes a worktree holding untracked and modified files.
