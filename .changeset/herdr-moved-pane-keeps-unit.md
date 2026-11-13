---
"cyberlegion": patch
---

A unit whose herdr pane moves to another workspace is no longer marked exited and deleted by `unit prune`. A herdr pane record now carries the pane's herdr terminal id, which survives `herdr pane move`; `prune`, `reconcile`, `sessionLive` and `unit rebind` judge such a record by its terminal and follow it to the new pane id, and `touch` heals the record from `herdr pane current`. Records written before this keep being judged by their pane id.
