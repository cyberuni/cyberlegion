---
title: CLI Overview
description: The cyberlegion command groups, output format, and when to reach for the CLI directly instead of the skills.
---

`cyberlegion` provides seven command groups — `unit`, `mail`, `agent`, `mux`, `attach`, `init`,
`admin` — plus hot-path top-level aliases for the most common verbs: `spawn`, `send`, `inbox`,
`who`. A bare `cyberlegion` (no subcommand) prints a compact status line: this session's own
identity, its unread count, and how many units are live. It always exits `0` and works even when
the session isn't registered yet.

```sh
npx cyberlegion              # bare status
npx cyberlegion unit who     # list addressable units
npx cyberlegion mail inbox   # list this session's mail
```

## Skill or CLI?

The CLI is **pure mechanism** — it spawns sessions, sends and reads mail, and reports environment
state, but it never decides *how* to reach a peer (warm session vs. cold subagent vs. inline) and
never invokes a harness's own subagent tool. That judgment is the [Legate](/skills/legate/)'s job.

Reach for the CLI directly when you already know exactly which command you need — scripting a
known flow, or diagnosing with `mux doctor`. Reach for a skill when the request is "get a message
to that peer" or "set this up" and the routing or onboarding judgment still needs to happen — the
skill will call the same commands underneath.

## Output format

Every command accepts `--format toon|json`, defaulting to `toon` — a token-efficient tabular
format meant for an agent to read directly. Pass `--format json` for machine consumption in a
script. There is no `--format text`; `toon` already reads as plain text.

Every command also accepts `--space <path>` to isolate the hub root, overriding the global hub or
`$CYBERLEGION_ROOT` — useful for tests and for running multiple independent hubs side by side.

## Command groups

| Group | Owns | Reference |
|---|---|---|
| `unit` | register/discover units, spawn/reap warm sessions | [CLI: unit](/cli/unit/) |
| `mail` | durable inter-agent messaging | [CLI: mail](/cli/mail/) |
| `agent` | resolve reusable agent definitions | [CLI: agent](/cli/agent/) |
| `mux` | multiplexer detection and diagnostics | [CLI: mux](/cli/mux/) |
| `attach` | bind the human's read-pane | [CLI: attach](/cli/attach/) |
| `init` | onboarding — detect harness, wire the hook | [CLI: init](/cli/init/) |
| `admin` | hub-state maintenance | [CLI: admin](/cli/admin/) |

See [Concepts](/concepts/architecture/) for the layering and invariants these groups follow, and
[Skills](/skills/) for the plugin built on top of them.
