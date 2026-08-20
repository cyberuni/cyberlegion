# cyberlegion

[![npm version](https://img.shields.io/npm/v/cyberlegion.svg)](https://www.npmjs.com/package/cyberlegion)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](license)

Harness-agnostic, MCP-free agent session spawning and messaging over the filesystem — Claude Code, Cursor, and Codex, all on one **Legion**. No daemon, no port, no server to keep alive: state lives under a shared hub root (`$CYBERLEGION_ROOT`, else the global hub), and coordination rides each harness's own session-start hook.

## Why

The usual way to wire agents together is MCP — a server to start, a port to hold open, config to add to every harness. cyberlegion needs none of it. The CLI is pure mechanism: it spawns and messages agent sessions, but it never decides *how* to reach a peer (a warm interactive session vs. a cold subagent vs. running inline) — that judgment belongs to a routing layer built on top (the **Legate**, shipped as this repo's plugin).

## Installation

No install required — run with `npx`:

```sh
npx cyberlegion <command>
```

Or pin to an exact version for reproducible hooks:

```sh
npx cyberlegion@0.3.1 <command>
```

## CLI

```sh
npx cyberlegion unit register --handle scout   # register/refresh this session
npx cyberlegion unit who                       # list addressable peers / live sessions
npx cyberlegion unit spawn --agent reviewer    # launch a peer in its own git worktree
npx cyberlegion mail send --to scout --body "ready"
npx cyberlegion mail inbox
npx cyberlegion mail await                     # block until a thread reply arrives
npx cyberlegion mux doctor                     # probe harness, multiplexer, hub root, self-id
npx cyberlegion init                           # wire the mail-surfacing hook into a harness config
```

Command groups: `unit` (register, discover, spawn/reap sessions), `mail` (durable inter-agent
messaging), `agent` (resolve reusable agent definitions under `.agents/agents/`), `mux`
(multiplexer diagnostics), `attach` (the human's read-pane), `init` (onboarding), `admin`
(hub-state maintenance). Top-level shortcuts exist for the common verbs: `spawn`, `send`,
`inbox`, `who`.

| Option | Description |
| --- | --- |
| `--space <path>` | Isolate the hub root (overrides the global hub / `$CYBERLEGION_ROOT`) |
| `--format <format>` | Output format: `toon` (default) or `json` |

See [`packages/cyberlegion/readme.md`](packages/cyberlegion/readme.md) for the full command
reference.

## Plugin

The npm package's sibling, `plugins/cyberlegion`, ships the agent plugin — the **Legate**
routing layer, its skills (`legate`, `dispatch-governance`, `manage-inbox`, `init-cyberlegion`,
and more), and the `headless-legate` subagent for unattended dispatch.

```
/plugin marketplace add cyberuni/cyberlegion
/plugin install cyberlegion
```

## Documentation

Full docs: <https://cyberuni.github.io/cyberlegion>

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) and [AGENTS.md](AGENTS.md).

## License

[MIT](license)
