---
'cyberlegion': patch
---

A spawned unit's SessionStart mail hook now runs the CLI that spawned it, not the installed plugin's copy. `unit spawn` sets `CYBERLEGION_CLI` to the unit's CLI shim, and the plugin hook runs it when it names an executable, falling back to the plugin's own CLI otherwise — never to whatever `cyberlegion` is on PATH.
