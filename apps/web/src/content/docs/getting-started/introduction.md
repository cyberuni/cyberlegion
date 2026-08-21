---
title: Introduction
description: What cyberlegion gives you, the Legate plugin you talk to, and the CLI underneath it.
---

**cyberlegion** lets one agent session reach another. Send a peer a message, spawn one to take a
piece of work off your hands, collect the verdict when it comes back. Sessions in Claude Code,
Cursor, and Codex all join the same **Legion** and address each other the same way, so a mixed set
of tools behaves like one team.

There is nothing to run. No server, no port, no daemon to keep alive. State lives under a shared
hub root (`$CYBERLEGION_ROOT`, else the global hub), and each harness's own session-start hook
delivers the mail. [SDD](https://cyberuni.github.io/sdd/) and
[cyberfleet](https://cyberuni.github.io/cyberfleet/) are both built on it.

## The Legate

The Legate is the agent plugin, and it is the part you talk to. Ask in plain language: get this to
the pane on the right, spawn a reviewer for this branch, tell me what is in my inbox. It reads the
request and works out how to reach the target, choosing between a warm peer in its own pane, a
cold one-shot subagent, and simply doing the work in-session.

That choice is the whole value of the layer. Load the [`legate` skill](/cyberlegion/skills/legate/)
in any session and you have it, along with onboarding and inbox skills for the rest. See
[Skills](/cyberlegion/skills/).

## The CLI

`cyberlegion` is the npm package the Legate composes, and you can drive it yourself. It spawns
sessions, sends and reads mail, and reports which multiplexer is live. It never decides *when* any
of that is the right move, which is exactly why a routing layer can be built on top of it.

Reach for it directly when you already know the command you want, or when you are scripting. Its
output is shaped for agents to read: token-efficient TOON by default, `--format json` when
something needs to parse it. See the [CLI Reference](/cyberlegion/cli/).

## Where to go next

- [Installation](/cyberlegion/getting-started/installation/): the plugin via the marketplace, the CLI via npx
- [The Spine](/cyberlegion/concepts/spine/): the three nouns every command is named after
- [Architecture](/cyberlegion/concepts/architecture/): how the layers fit and the invariants that hold them
