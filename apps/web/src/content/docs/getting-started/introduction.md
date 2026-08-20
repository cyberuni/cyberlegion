---
title: Introduction
description: What cyberlegion is, the problem it solves, and the pieces it ships — the CLI console and the Legate routing layer.
---

**cyberlegion** is harness-agnostic, MCP-free agent session spawning, messaging, and dispatch over
the filesystem — Claude Code, Cursor, Codex, all on one **Legion**. It's the foundation both
[SDD](https://cyberuni.github.io/sdd/) and [cyberfleet](https://cyberuni.github.io/cyberfleet/)
build on: addressable agent units, mustered and reaped, commanded and communicating, with no
server, port, or daemon to keep alive.

State lives under a shared hub root (`$CYBERLEGION_ROOT`, else the global hub).

## Why no MCP

The usual way to wire agents together is MCP: a server to start, a port to hold open, config to
add to every harness. cyberlegion needs none of it. Coordination lives in the shared hub on the
filesystem, rides each harness's own session-start hook, and speaks no vendor-specific protocol —
so Claude Code, Cursor, and Codex all join the same Legion with no per-harness glue.

## Two things it ships

cyberlegion is one repository with two halves that ship together but stay strictly layered:

- **The console** — the `npm` package (`cyberlegion`), a cold, deterministic CLI. It never decides
  *when* to spawn a peer versus a subagent; it only offers the primitive once a caller has decided.
  See the [CLI Reference](/cli/).
- **The Legate** — the agent plugin, the routing brain built on top of the console. It carries the
  judgment the CLI deliberately doesn't: which dispatch strategy to use for a given intent. See
  [Skills](/skills/).

## Where to go next

- New to the CLI? Start with [Installation](/getting-started/installation/).
- Want the mental model before the commands? Read [Concepts](/concepts/architecture/).
- Working from an agent session? Load the [`legate` skill](/skills/legate/).
