---
"cyberlegion": patch
---

`unit rebind` in a herdr pane that has moved no longer binds another unit's pane. It now resolves the calling pane the way `unit register` does: the pane herdr reports on herdr 0.8.2 or later, `$HERDR_PANE_ID` when herdr gives no answer or is older.
