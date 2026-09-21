---
'cyberlegion': patch
---

`unit spawn --agent` now passes a def's instructions in a form each harness accepts. Claude still gets `--append-system-prompt`. Codex now gets its `developer_instructions` config override (`-c developer_instructions="…"`), because codex has no `--append-system-prompt` flag. Cursor has no way to take instructions from the command line, so spawn now writes them in front of the task in the peer's brief file, under an `## Agent instructions` heading.
