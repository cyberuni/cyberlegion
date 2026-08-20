---
title: Skills
description: The three user-facing skills the cyberlegion plugin ships, the internal governance skills behind them, and when to run the CLI instead.
---

The plugin ships three user-facing skills. [`legate`](/skills/legate/) is the front door to
reaching another agent session — send, spawn, wait, dispatch. [`init-cyberlegion`](/skills/init-cyberlegion/)
onboards a session or repository: probe the environment, register the surfacing hook, and offer to
bind the owner pane. [`manage-inbox`](/skills/manage-inbox/) is the human's surface for the owner
mailbox — the durable inbox headless and cron-started agents report into.

| Reach for | When |
|---|---|
| [`legate`](/skills/legate/) | reaching another session — send mail, check inbox, spawn/close a peer, wait for a reply, dispatch work to fulfill a role |
| [`init-cyberlegion`](/skills/init-cyberlegion/) | setting up cyberlegion in this session or repo for the first time |
| [`manage-inbox`](/skills/manage-inbox/) | checking, reading, or clearing the owner mailbox as a human roaming across sessions |
| the [CLI](/cli/) | you already know exactly which command you need, or you're scripting a known flow |

`legate` and `init-cyberlegion` each wrap CLI commands but carry judgment the CLI deliberately
doesn't: `legate` decides *how* to reach a peer (or hands that decision to `dispatch-governance`),
and `init-cyberlegion` decides whether this looks like a root session worth offering to bind.
`manage-inbox` is a thinner wrapper — it decides nothing about routing, only which owner-scoped
mail command answers the human's ask.

## Skill or CLI?

Reach for a skill when the request is judgment-shaped — "get this to that peer," "set this up,"
"what's in my inbox" — and let the skill pick the commands. Reach for the [CLI](/cli/) directly
when you already know the exact command and flags, or you're scripting a flow outside an agent
session entirely.

## Internal governance skills

Four more skills back these three but are marked `user-invocable: false` — they're loaded by name
from another skill or agent, never triggered directly by a user request, and aren't part of the
public skill surface:

- **`dispatch-governance`** — the Legate's routing brain: resolves an agent definition's
  `warm`/`interactive` tags and the environment's multiplexer availability, then picks exactly one
  dispatch strategy (channel, run-inline, or subagent). Loaded by `legate` when a request needs
  routing judgment.
- **`relay-governance`** — the report/ask contract for a headless agent with no live user channel:
  how it returns a result or surfaces a question it cannot answer live, and how a receiver triages
  a relayed steer by authority level.
- **`session-adapter-governance`** — the conformance rule for every mutating multiplexer operation
  (`send`, `submit`, `focus`, `nudge`, `clear`, the mail-delivery doorbell): verify the observable
  effect actually landed, or fail loud — never fire-and-forget.
- **`subagent-backend-governance`** — the concrete procedure `dispatch-governance` runs once it has
  picked the **subagent** strategy: resolve the agent def, then realize it via the caller's own
  Task tool.

See [Architecture: Routing judgment lives above the CLI](/concepts/architecture/#routing-judgment-lives-above-the-cli)
for how these fit together.

## Install

In Claude Code, add the [cyberplace](https://github.com/cyberuni/cyberplace) marketplace and
install the plugin:

```text
/plugin marketplace add cyberuni/cyberplace
/plugin install cyberlegion@cyberplace
```

Or straight from this repository:

```text
/plugin marketplace add cyberuni/cyberlegion
/plugin install cyberlegion
```

The three user-facing skills come with it:

```text
/cyberlegion:legate
/cyberlegion:init-cyberlegion
/cyberlegion:manage-inbox
```

## The commands behind them

Every skill on this page is a wrapper over `cyberlegion` CLI calls — none of them talk to the
filesystem or another session directly. See the [CLI Reference](/cli/) for the full command
surface.
