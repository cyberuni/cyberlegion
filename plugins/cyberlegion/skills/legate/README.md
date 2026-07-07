# legate (gateway)

The Legate's front door to the Legion — a thin classifier skill that routes an agent-to-agent
messaging or dispatch request to the matching `cyberlegion` CLI call, or to `dispatch-governance`
when the request needs routing judgment.

## When to use

- You need to send or check mail with another agent session.
- You need to spawn, close, or nudge a peer session.
- You need to wait for a threaded reply.
- You need work done to fulfill a role and a verdict back — but do not yet know whether that should
  be a warm peer, a cold subagent, or done inline.

## What it does

- Classifies the request against a fixed intent → CLI-call table (mail, session, identity, admin).
- Hands any dispatch intent to `dispatch-governance` rather than guessing a strategy.
- Spawns the `headless-legate` agent when there is no user channel to relay through.
- Loads no other governance and writes no state — a front door only.

Every mechanic is a `cyberlegion` CLI call — harness-agnostic, MCP-free.
