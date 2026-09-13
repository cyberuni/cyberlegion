# dispatch-governance

Partial Skill: invoke by name only — the Legate's routing brain. Not user-invocable — loaded by the `legate` gateway
in-session on a dispatch intent, and by the `headless-legate` agent when there is no user channel.

## When it loads

- The `legate` gateway classified a request as "dispatch work to fulfill a role and expect a
  verdict back."
- The `headless-legate` agent realizes the same flow headless.

## What it does

- Resolves the target agent definition's `warm`/`interactive` tags (`cyberlegion agent resolve`).
- Probes the environment for a multiplexer (`cyberlegion mux doctor`).
- Picks exactly one of three strategies — **channel** (warm peer: `unit spawn` + `mail await`),
  **run-inline** (caller does the work itself), or **subagent** (cold, one-shot, via
  `subagent-backend-governance`) — and executes it by composing the `cyberlegion` CLI primitives.
- Folds in the wake-matrix decision (bounded await vs doorbell vs run-inline, gated on a verified
  multiplexer) that the CLI no longer encodes.
- Defines the `subagent | channel` seam a dependent (SDD, ADR-0023) references by intent, never by
  a literal command name.

## What it does not do

- Never lets the CLI auto-route — there is no `--backend auto` flag, and no `dispatch` command
  group at all; `unit spawn`/`mail await`/`unit nudge` are composed here deliberately.
- Never invokes a harness's Task tool directly (that happens inside `subagent-backend-governance`,
  using the caller's own tool).
