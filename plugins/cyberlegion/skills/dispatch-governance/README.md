# dispatch-governance

Internal skill: the Legate's routing brain. Not user-invocable — loaded by the `legate` gateway
in-session on a dispatch intent, and by the `headless-legate` agent when there is no user channel.

## When it loads

- The `legate` gateway classified a request as "dispatch work to fulfill a role and expect a
  verdict back."
- The `headless-legate` agent realizes the same flow headless.

## What it does

- Resolves the target agent definition's `warm`/`interactive` tags (`cyberlegion agent resolve`).
- Probes the environment for a multiplexer (`cyberlegion admin doctor`).
- Picks exactly one of three strategies — **channel** (warm peer), **run-inline** (caller does the
  work itself), or **subagent** (cold, one-shot, via `subagent-backend-governance`) — and executes
  it with the `cyberlegion` CLI primitives.
- Defines the `subagent | channel` seam a dependent (SDD, ADR-0023) references by intent, never by
  a literal command name.

## What it does not do

- Never lets the CLI auto-route — there is no `--backend auto` flag.
- Never invokes a harness's Task tool directly (that happens inside `subagent-backend-governance`,
  using the caller's own tool).
