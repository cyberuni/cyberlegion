---
'cyberlegion': patch
---

`unit spawn --agent` now launches with the agent def's `effort`. Before this fix the value was parsed and then silently dropped. Each harness receives it through its own control: `--effort <level>` for claude, `-c model_reasoning_effort="<level>"` for codex, and a bracket parameter on the model (`<model>[effort=<level>]`) for cursor. Cursor has no effort control apart from the model, so a cursor def that sets `effort` without a `model` now fails with an error instead of launching at the default effort.
