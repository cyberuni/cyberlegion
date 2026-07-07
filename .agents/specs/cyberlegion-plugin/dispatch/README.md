---
spec-type: behavioral
concept: routing
---

# dispatch — the Legate's routing brain

The **one realization** of the Legate role — resolving a dispatch intent (fulfill role `R` with
brief `B`, expect a verdict matching schema `V`) into exactly one of three strategies, whichever
surface it runs on. By default it is the **attended session** (loads `dispatch-governance`
in-session, holds the caller's channel); in the **headless fallback** it is the spawned `headless-legate`
agent, batching `needsInput` instead of asking live. Both loads run the identical procedure; this
node covers both, the same way SDD's `mission/conductor` node covers its in-session and automaton
realizations in one spec.

This node also covers `subagent-backend-governance` — the concrete three-step procedure
(`prep` → caller's own Task tool → `collect`) the **subagent** strategy runs once picked; it is a
sub-procedure of this behavior, not a separate capability.

It further covers `relay-governance` — the **report/ask contract** orthogonal to strategy choice:
once a result (or an unanswerable question) exists, how it gets home is keyed on the *reporting
agent's own lifecycle*, not on which strategy dispatched it. A framed callee (Task-spawned subagent,
or a peer a spawner awaits) returns `needsInput` up its frame; a **bare top-level / cron** session
with no frame pushes mail to the standing owner and exits, and the report surfaces into the human's
next root session (the CLI's `surfacing` node). This is where the headless "batch needs-input and
relay" behavior lives now — `dispatch-governance` and `headless-legate` load it rather than restating
it. `relay-governance` states transport only; the standing owner identity, owner mail, and surfacing
are the sibling `cyberlegion` CLI's mechanism.

## Use Cases

**Subject** — given an intent to fulfill a role with a brief, deciding whether that role runs as a
warm interactive peer, a cold one-shot subagent, or inline in the caller's own session — and
executing that choice with the `cyberlegion` CLI primitives.

**Non-goals** — the CLI primitives themselves (`dispatch prep`/`channel`/`collect`,
`agent resolve`, `admin doctor` — those are the sibling `cyberlegion` CLI project); auto-routing
inside the CLI (there is no `--backend auto` — the CLI never chooses on its own); a mid-flight
strategy switch once one is picked.

| Behavior | Trigger | Outcome |
|---|---|---|
| **resolve tags + environment** | any dispatch intent reaches this node | `agent resolve <R>` for `warm`/`interactive`; `admin doctor` for multiplexer presence |
| **pick channel** | `warm` + `interactive` + a multiplexer is present | `dispatch channel --agent R --brief-file B [--verdict-schema V] --wait` — a warm peer that can converse over rounds |
| **pick run-inline (attended)** | `warm` + `interactive` + no multiplexer, in-session | returns a `run-inline` verdict; the caller does the work itself — no cold subagent substitute |
| **pick run-inline has no seat (headless)** | `warm` + `interactive` + no multiplexer, under `headless-legate` | the Legate cannot run the work itself; returns `needsInput` naming the role + brief for its own relay to resolve |
| **pick subagent** | not (`warm` + `interactive`) — a cold, one-shot role | realized via `subagent-backend-governance`: `dispatch prep` → caller's own Task tool → `dispatch collect` |
| **fan out N briefs (headless only)** | `headless-legate` receives a batch of briefs | resolves and runs each independently; subagent dispatches may run concurrently, channel dispatches are capped by the environment's multiplexer |
| **report the result uniformly** | any strategy completes | returns a `DispatchResult` (`strategy`, `id`, `verdict`, `result`, `needsInput`) the caller handles the same way regardless of strategy |
| **the `subagent \| channel` seam** | a dependent (e.g. SDD) needs a role fulfilled | the dependent states intent only (role, brief, verdict schema) — never pins a literal command name — and this node decides the mechanism |
| **relay by lifecycle** (`relay-governance`) | a headless agent has a result or an unanswerable question | framed callee → return `needsInput`; bare top-level/cron → `mail send` to the standing owner + exit; owner report surfaces to the human, read is a deliberate `mail ack --owner` |
