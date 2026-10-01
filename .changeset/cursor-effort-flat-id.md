---
"cyberlegion": patch
---

`unit spawn` (and `service start`) on cursor with both a model and an effort no longer launches `--model '<model>[effort=<level>]'`, which current `cursor-agent` refuses with "Cannot use this model". It now runs `cursor-agent models` and launches the flat `<model>-<level>` id when that id is listed. When no such id is listed, or the listing fails, it launches the model without the effort, warns on stderr, and reports the effort as `<level> (not applied)`.
