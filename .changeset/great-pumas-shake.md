---
'cyberlegion': minor
---

`unit close --keep-worktree` reaps a unit's record, mailbox, pane and brief while leaving its
worktree on disk, and reports the retained path (`retained` in TOON, `retainedWorktree` in JSON) so
a pool can detach the checkout and spawn the next unit into it with `--cwd`.

Because nothing is deleted, the flag skips the dirty-worktree refusal — that check only ever
protected uncommitted work from `git worktree remove`. The primary-checkout refusal is unchanged:
neither `--force` nor `--keep-worktree` overrides it.
