---
"cyberlegion": minor
---

A unit now records a worktree it works in but does not own as `sharedWorktree` (`root`, `branch`, `primaryRoot`, and `owner`, the id of the unit that owns it). `unit spawn --cwd` records the checkout its directory sits in, and `unit register` records a worktree another unit's record owns this way instead of taking it as its own `worktree`. `unit close` never removes, prunes, or releases a shared worktree, so closing such a unit can no longer remove another unit's worktree or release its lease. `unit who` gains a `shared` column and `unit show` a `shared` field (`sharedWorktree` in JSON), so a sweep can judge the unit by that checkout. Records without the field read as before.
