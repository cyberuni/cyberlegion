---
"cyberlegion": minor
---

`unit close` now closes a unit whose worktree is its repository's primary checkout instead of refusing it. It ends the session and deletes the record, pane pointer, brief and mailbox, and never removes, resets or cleans the checkout, so no `--force` is needed and uncommitted changes there are not refused. `--force` is still refused for such a unit, since it asks to discard changes in the checkout. This lets a live seat on a main checkout, or an exited record pointing at one, be removed for good.
