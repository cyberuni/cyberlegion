---
"cyberlegion": patch
---

`unit prune` no longer exits a unit whose pane is still live just because its last-seen is more than 15 minutes old — a unit working without calling the CLI, or idle at its prompt, keeps its handle. The staleness timer now applies only to records with no pane. When a pane's multiplexer cannot be queried, `prune` (and `who --reconcile`) leaves the record alone rather than reaping a possibly live unit.
