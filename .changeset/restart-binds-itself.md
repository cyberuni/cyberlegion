---
"cyberlegion": patch
---

`unit restart` no longer leaves a running session unbound when it dies between opening the new pane and binding the unit to it. The new pane's launch line now runs `unit rebind <id>` through the unit's CLI shim before the harness starts, so the session binds itself to the unit. The unit comes back `active` in the new pane, with no rerun and no second pane.
