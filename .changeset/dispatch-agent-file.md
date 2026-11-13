---
'cyberlegion': minor
---

`dispatch-governance` now accepts an agent definition by file path. A dispatch intent can carry the path of a definition file, and the skill resolves it with `agent resolve --file` and spawns with `unit spawn --agent-file` instead of looking the role up by name. This lets a caller route a definition a plugin ships, which is not under the project's `.agents/agents/`.
