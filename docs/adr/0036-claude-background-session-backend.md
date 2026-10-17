# ADR-0036: Claude background sessions as a session backend

## Status

Accepted

## Context

`unit spawn` needs a session backend, and until now that meant a terminal multiplexer. Outside tmux
or herdr, spawn refused. That shuts out a Claude Code user working in a plain terminal, an IDE, or
the desktop app, and a scheduler that runs with no terminal at all.

Claude Code runs its own background sessions. `claude --bg` starts a session and prints its id;
`claude agents --json` lists sessions with their state; `claude logs`, `claude stop`, and
`claude rm` read, stop, and delete one. Probed live on Claude Code 2.1.299:

| Question | Finding |
|---|---|
| First turn | The prompt argument to `claude --bg` is the first turn. There is no boot race to recover from. |
| Environment | The session inherits the launcher's environment, `PATH`, and working directory. |
| States | Each entry has a `status` (`busy` during a turn, `idle` between turns, absent with no process) and a `state` (Claude Code's read of the task: `working`, `done`, `blocked` while waiting on a person, `failed`, `stopped`). They are independent: a live run showed an idle session whose task was unfinished reading `idle` + `working` indefinitely. A session started with no prompt reads `blocked`, the same as one stuck at a permission prompt. A stopped session stays listed with no `status`; its state reads `stopped` only when it was stopped mid-turn, and a session stopped after its turn finished keeps `done` (found by the second live run). |
| Ids | The short id is the first 8 characters of the full session id. The listing carries both. |
| Ringing a live session | Not possible from outside. `claude --bg --resume` on a running session starts a copy. |
| Ringing a stopped session | `claude stop <id>`, then `claude --bg --resume <full session id> "<text>"`, resumes the same session id with the new prompt and its saved options. |
| Environment after a ring | The resumed session keeps the environment it was started with, not the ringer's. |
| Folder trust | `claude --bg` refuses a folder Claude Code does not trust: exit 1, stderr starting `Workspace not trusted.`, nothing on stdout. There is no prompt to accept. Trust of a parent folder covers the folders under it. |
| `claude rm` | Deletes the session. It leaves a git worktree it did not create on disk. |

## Decision

### 1. Selection: a multiplexer wins, then the background backend for Claude, then refuse

Spawn picks its backend in this order:

1. A detected tmux or herdr, exactly as before.
2. With none, and the unit's harness is `claude`, a Claude background session.
3. Otherwise, refuse as before, naming the backends a non-Claude harness needs.

`selectSessionAdapter` and `mux mode` stay about multiplexers only. The harness-aware step is a
separate spawn-level selection, so `mux mode` still reports `none` outside a multiplexer. Fallback is
automatic: the owner chose it over an opt-in flag because the alternative was a refusal.

### 2. The locator is a third closed member

`AgentRecord.pane` gains `{ mux: 'claude-bg', id: <short id> }`. The short id is what `claude --bg`
prints and what `claude logs`, `stop`, and `rm` take. The full session id, the only form
`claude --bg --resume` accepts without starting a copy, is not stored: the ring reads it from the
listing it already queries for the session's state. Storing it would need a second call at spawn,
whose failure would strand a running session with no record.

ADR-0035 leaves open whether the locator should become an open tag. This CR does not settle that. It
adds one member to the existing closed union, which an open tag could absorb later without changing
any stored record.

### 3. The backend lives in cyberlegion, not cyber-mux

A background session is not a terminal multiplexer: it has no panes, no placement, no workspace tier,
and works for one harness only. Putting it behind cyber-mux's `MuxAdapter` would mean stubbing most of
that interface. cyberlegion owns it, and dispatches on the record's locator for every per-unit op.

### 4. How each op behaves

| Op | On a background unit |
|---|---|
| spawn | Runs `claude --bg --name <handle>` with the unit's launch flags and the spawn wake as the prompt, in the unit's folder, with `CYBERLEGION_AGENT_ID` and the CLI shim in its environment. `--at` is ignored: there is no space to place. |
| `--no-wake` | Refused before anything opens. A session started with no prompt reads `blocked`, which the ring cannot tell from a permission prompt, so it could never be rung. |
| an untrusted folder | Refused. The worktree spawn made is released, and the error names the folder to trust. |
| a launch that is not `claude` | Refused before anything opens: a custom launch command (passed through the library `spawn`; the CLI has no flag for it) may not take `--bg`. |
| ring (`unit nudge`, `mail send`) | State `blocked`: not rung, reported as waiting on a person, with `claude attach <id>` as the next step. Status `busy`: not rung, reported busy. Status `idle`: stop, then resume by full session id with the ring text; rung once the resume reports it woke the same short id. Neither busy nor idle: not rung. A `stopped` record is not rung: its mail waits. The first freeze keyed idleness on `state: done`; the live run disproved it and the owner approved re-keying it on `status`. |
| read | `claude logs <id>`, stripped of terminal control sequences, then bounded by `--lines`. |
| focus | Refused with `claude attach <id>` as the next step. There is no attached view to move. |
| show | Liveness from the listing (`live` when listed with a status; `gone` when absent; `unknown` when the listing cannot be read). Controls: `nudge`, `read`, `stop`, `close` when live; `close` alone otherwise. |
| stop | `claude stop`, verified by the listing showing the session with no running process (no `status`). The record keeps its locator, so `close` can still delete the session. |
| close | The existing close refusals and worktree removal run first; only then `claude stop` and `claude rm`, whose failures are tolerated. A refused close leaves the session untouched. |
| prune | Alive while `claude agents --json --all` lists the session. Absent from a listing that parses, even an empty one, means exited. If the listing cannot be read, the unit is left untouched. Reconcile never culls a `claude-bg` record. |
| `unit rebind` | Refused: it would replace the locator with the caller's pane and leave the session with nothing that can delete it. |
| `unit clear`, `unit restart` | Refused for now, naming the background backend. Follow-ups. |

A unit whose record is active while Claude Code lists its session with no running process is an **invalid state**,
outside the contract by the owner's ruling. A ring whose resume fails after its stop leaves a unit
there, and so does a `claude stop` run outside cyberlegion or a session whose process ended on its own. The ring fails loud. What `show` and `prune` report for
such a unit is not specified; a later ring refuses it as neither busy nor idle.

The ring keeps ADR-0025's rule by confirming the effect from the resume's own output: it wakes the
same short id, or the ring fails loud. Polling the state for `working` was rejected because a quick
turn can pass from `working` back to `done` between two polls.

## Consequences

- A Claude user with no multiplexer can spawn units. A scheduler that used to get a refusal now
  starts a session that runs and costs money.
- Mail sent to a busy background unit waits until the unit is next rung. A Stop hook that surfaces
  it at the end of the turn is tracked separately (issue #190).
- Folder trust is now a precondition the CLI cannot satisfy for the user. Worktrees sit beside the
  primary checkout, so trusting the folder that holds the repository covers them.
- `unit clear` and `unit restart` do not yet work on background units.
- ADR-0034 (terminal views) and ADR-0035 (terminal-API backends) stay proposals.
