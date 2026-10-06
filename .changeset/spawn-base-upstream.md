---
"cyberlegion": minor
---

`unit spawn` (and `service start`) now cut a new worktree's branch from freshly fetched `origin/HEAD` instead of the caller's local HEAD, so a unit no longer starts behind its upstream. `--base <ref>` names the start point instead. When there is no origin, the fetch fails, or `origin/HEAD` is not recorded, spawn falls back to local HEAD and says why on stderr. The spawn output reports the `base` it used.
