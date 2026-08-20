---
title: 'CLI: agent'
description: 'CLI reference for cyberlegion agent: list, show, resolve, and locate reusable agent definitions.'
---

```sh
npx cyberlegion agent <list|show|resolve|path> ...
```

`agent` resolves reusable agent definitions under `.agents/agents/*.md` — the template noun of
[the spine](/concepts/spine/). It never spawns anything; it only reads and reports a definition
for a caller (typically `unit spawn --agent <name>`, or the Legate composing a dispatch) to act on.

## list

```sh
npx cyberlegion agent list [--dir <path>]
```

List resolvable agent definitions under `.agents/agents/`.

| Option | Meaning |
|---|---|
| `--dir <path>` | project dir to search from (default: current working directory) |

Output: a `defs` table (`name`, `model`, `harness`). Suggests adding a `.md` file under
`.agents/agents/` when the list is empty.

## show

```sh
npx cyberlegion agent show <name> [--dir <path>] [--full]
```

Show a resolved agent definition (model/effort/harness/warm/interactive + instructions).

| Option | Meaning |
|---|---|
| `--dir <path>` | project dir to search from |
| `--full` | show the full instructions body (default: truncated to 200 characters) |

Output fields: `name`, `description`, `model` (or `(harness default)`), `effort`, `harness` (or
`(harness default)`), `warm`, `interactive`, `path`, `instructions`.

## resolve

```sh
npx cyberlegion agent resolve [name] [--file <path>] [--dir <path>]
```

Emit the full machine payload for a def — for a routing caller (the Legate's
`dispatch-governance`) to compose a launch/spawn from.

| Option | Meaning |
|---|---|
| `--file <path>` | read an exact def file instead of resolving by name (plugin-scoped escape hatch) |
| `--dir <path>` | project dir to search from |

`name` is omitted only when passing `--file`.

## path

```sh
npx cyberlegion agent path <name> [--dir <path>]
```

Print the resolved def file path.

## Related

- [The Spine](/concepts/spine/) — where `agent` (definition) sits relative to `unit` (instance)
- [CLI: unit](/cli/unit/) — `unit spawn --agent <name>` consumes what this group resolves
- [Skill: legate](/skills/legate/) and its `dispatch-governance` internals read `warm`/`interactive`
  off `agent resolve` to pick a dispatch strategy
