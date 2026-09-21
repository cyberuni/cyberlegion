---
'cyberlegion': minor
---

`unit spawn` accepts `--model <name>` and `--effort <level>`, which set the model and effort for one launch. The precedence is flag > agent def > harness default, and a flag never writes back to the def. The flags work with `--agent`/`--agent-file` and with a bare `--harness`. The spawn output now includes `model` and `effort`, reporting what the session launched with, or `(harness default)` when no source set one.
