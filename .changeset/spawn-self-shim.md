---
"cyberlegion": patch
---

`unit spawn` now puts a `cyberlegion` command on the spawned session's PATH. It is a shim in the unit's data dir that re-runs the exact CLI that spawned the unit, so a brief's `cyberlegion mail send` works as written and reports through the spawning version, not one fetched from the registry.
