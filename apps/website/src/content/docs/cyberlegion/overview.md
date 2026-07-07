---
title: cyberlegion Overview
description: Harness-agnostic, MCP-free agent session spawning, messaging, and dispatch over the filesystem — the foundation SDD and cyberfleet build on.
---

**cyberlegion** is harness-agnostic, MCP-free agent session spawning, messaging, and dispatch over the filesystem (Claude Code, Cursor, Codex). It is the foundation both [SDD](/sdd/overview/) and [cyberfleet](/cyberfleet/overview/) build on: a **Legion** of addressable agent units, mustered and reaped, commanded and communicating with no server, port, or daemon to keep alive.

State lives under a shared hub root (`$CYBERLEGION_ROOT`, else the global hub).

## The console

The `cyberlegion` CLI is the cold, deterministic mechanism — dumb hands a routing layer composes. It never decides *when* to spawn a peer versus a subagent; it only offers the primitive once a caller has decided.

| Command group | What it does |
|---|---|
| `identity` | Self-identify and discover addressable peers — `register`, `whoami`, `who`, `prune` |
| `session` | Warm peer session lifecycle over a multiplexer — `spawn` (in its own git worktree), `list`, `focus`, `nudge`, `read`, `close` |
| `mail` | Durable inter-agent messaging — `send`, `inbox`, `read`, `ack`, `delete`, `await` (block for a reply), `watch`, `hook` |
| `dispatch` | Delegate work and await a result — `prep`, `channel --wait`, `collect` |
| `agent` | Resolve reusable agent definitions under `.agents/agents/` — `list`, `show`, `resolve`, `path` |

## The Legate

The **Legate** is the routing brain on top of the console — the judgment the CLI deliberately does not carry. Given an intent (fulfill a role with a brief, expect a verdict), it reads the target agent-definition's `warm`/`interactive` tags and the environment's multiplexer availability, then picks exactly one strategy:

- **channel** — a warm, interactive peer in its own pane (`dispatch channel`)
- **run-inline** — no multiplexer to host a peer, so the caller does the work itself, in-session
- **subagent** — a cold, one-shot unit realized via the caller's own Task tool (`dispatch prep` / `dispatch collect`)

In an attended session the Legate runs in-session as `dispatch-governance`; with no user channel it is realized headless as the `headless-legate` agent.

## The gateway

The `legate` skill is the thin front door — classify the request (send mail, check inbox, spawn/close a unit, wait for a reply, dispatch work) and either run the matching CLI call directly or hand routing judgment to `dispatch-governance`. It loads no governance itself and writes no state.

## Why no MCP

The usual way to wire agents together is MCP — a server to start, a port to hold open, config to add to every harness. cyberlegion needs none of it: coordination lives in the shared hub on the filesystem, rides each harness's own session-start hook, and speaks no vendor-specific protocol, so Claude Code, Cursor, and Codex all join the same Legion with no per-harness glue.

## Installation

```bash
npx skills add cyberuni/cyberplace --plugin cyberlegion --global
```

Run the CLI with `npx` (or pin a version for reproducible hooks):

```sh
npx cyberlegion <command>
npx cyberlegion@0.1.0 <command>
```

## Related

- [cyberfleet Overview](/cyberfleet/overview/) — the fleet-persona layer built on cyberlegion
- [SDD Overview](/sdd/overview/) — the spec-driven development process that dispatches over cyberlegion
