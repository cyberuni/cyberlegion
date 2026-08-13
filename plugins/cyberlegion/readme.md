# cyberlegion

Agent session spawning, messaging, and dispatch — harness-agnostic, MCP-free. The foundation both
SDD and cyberfleet build on: a **Legion** of addressable agent units, mustered and reaped, commanded
and communicating over the filesystem.

## The console

The `cyberlegion` CLI is the cold, deterministic mechanism: identity (`unit register`, `unit claim`,
`unit who`), warm peer sessions in their own git worktrees (`unit spawn`, `unit close`,
`unit prune`), durable mail (`mail send`, `mail inbox`, `mail read`, `mail await`),
agent-definition resolution (`agent resolve`), hook registration (`init`), and
admin/diagnostics (`mux doctor`, `admin migrate`). It never decides *when* to spawn a peer
versus a subagent, and it carries no dispatch/result-slot primitives of its own — a cold subagent
returns via the caller's own Task-result, a warm peer via `mail await`.

## The Legate

The **Legate** is the routing brain on top of the console — the judgment the CLI deliberately does
not carry. In an attended session it runs in-session as `dispatch-governance`; with no user channel
it is realized headless as the `headless-legate` agent. Given an intent (fulfill a role with a brief, expect a
verdict), it reads the target agent-definition's `warm`/`interactive` tags and the environment's
multiplexer availability, then picks exactly one strategy:

- **channel** — a warm, interactive peer in its own pane (`unit spawn` + `mail await` on the thread)
- **run-inline** — no multiplexer to host a peer, so the caller does the work itself, in-session
- **subagent** — a cold, one-shot unit realized via the caller's own Task tool, taking its
  Task-result (final returned message) as the verdict

## The gateway

`legate` (the skill) is the thin front door — classify the request (send mail, check inbox,
spawn/close a unit, wait for a reply, dispatch work) and either run the matching CLI call directly or
hand routing judgment to `dispatch-governance`. It loads no governance itself and writes no state.

## Onboarding and the owner mailbox

Two more user-facing skills sit beside the gateway:

- **`init-cyberlegion`** — the onboarding front door: probe the environment, register the
  mail-surfacing hook so incoming mail reaches you mid-session, and (only in a root session, only on
  an explicit yes) bind this pane as the durable `legate` owner inbox. Every step is a
  `cyberlegion` CLI call; the skill holds the conversation and the judgment.
- **`manage-inbox`** — the human's surface for that **owner mailbox**: the hub-level,
  session-independent inbox a standing identity holds, where frameless agents (cron-started, no
  parent frame) push their reports. It's how you read and ack those reports from whichever session
  you happen to be in.

## Installation

```bash
npx skills add cyberuni/cyberplace --plugin cyberlegion --global
```

The `cyberlegion` CLI ships separately on npm:

```bash
npm install -g cyberlegion
```

The plugin bundle carries the version it was built against in `.plugin/pins.json`, and its skills
read that pin to invoke `npx cyberlegion@<version> …` rather than inventing a version. In a
workspace checkout with no bundled pin, they fall back to the unpinned `npx cyberlegion …` form or
the local bin (`packages/cyberlegion/bin/cyberlegion.mjs`).
