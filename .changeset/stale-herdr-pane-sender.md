---
"cyberlegion": patch
---

A session in a herdr pane that has moved no longer acts as another unit. herdr gives a moved pane a new id while its shell keeps the old `$HERDR_PANE_ID`, and that old id can belong to another unit's pane, so `mail send` stamped that unit as the sender and `unit register` overwrote its record. Self-identity now asks herdr which pane is calling and keys by that id on herdr 0.8.2 or later, and falls back to `$HERDR_PANE_ID` when herdr gives no answer or is older.
