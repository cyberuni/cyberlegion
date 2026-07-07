# cyberlegion

Agent session spawning, messaging, and dispatch — harness-agnostic, MCP-free. The foundation both
SDD and cyberfleet build on: a **Legion** of addressable agent units, mustered and reaped, commanded
and communicating over the filesystem.

## The console

The `cyberlegion` CLI is the cold, deterministic mechanism: identity, warm peer sessions, durable
mail, dispatch primitives, agent-definition resolution, and admin/diagnostics. It never decides
*when* to spawn a peer versus a subagent — it only offers the primitive once a caller has decided.

## The Legate

The **Legate** is the routing brain on top of the console — the judgment the CLI deliberately does
not carry. In an attended session it runs in-session as `dispatch-governance`; with no user channel
it is realized headless as the `headless-legate` agent. Given an intent (fulfill a role with a brief, expect a
verdict), it reads the target agent-definition's `warm`/`interactive` tags and the environment's
multiplexer availability, then picks exactly one strategy:

- **channel** — a warm, interactive peer in its own pane (`dispatch channel`)
- **run-inline** — no multiplexer to host a peer, so the caller does the work itself, in-session
- **subagent** — a cold, one-shot unit realized via the caller's own Task tool (`dispatch prep` /
  `dispatch collect`)

## The gateway

`legate` (the skill) is the thin front door — classify the request (send mail, check inbox,
spawn/close a unit, wait for a reply, dispatch work) and either run the matching CLI call directly or
hand routing judgment to `dispatch-governance`. It loads no governance itself and writes no state.

## Installation

```bash
npx skills add cyberuni/cyberplace --plugin cyberlegion --global
```

The `cyberlegion` CLI ships separately from npm (not yet published — see the design doc's
`legion-publish` CR); until then, invoke it from a workspace checkout (`packages/cyberlegion/bin/cyberlegion.mjs`).
