---
'cyberlegion': patch
---

`unit spawn --agent` now passes a def's instructions in a form each harness accepts. Claude still gets `--append-system-prompt`. Codex now gets its `developer_instructions` config override (`-c developer_instructions="…"`), because codex has no `--append-system-prompt` flag. Cursor has no way to take instructions from the command line, so a cursor def with a non-empty body now fails with an error that names cursor. Before, it launched a session without the instructions.
