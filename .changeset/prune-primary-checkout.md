---
'cyberlegion': patch
---

`unit prune` now also deletes an exited unit whose recorded worktree is its repository's primary checkout. Close never removes that checkout, so the record, brief and mailbox no longer pile up for as long as the repository exists. An exited unit that owns a linked worktree still on disk is kept for `unit close`.
