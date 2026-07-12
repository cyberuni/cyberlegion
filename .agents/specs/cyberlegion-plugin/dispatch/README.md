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

The `cyberlegion` CLI is deliberately dumb hands: it never auto-routes, never picks a backend, never
invokes a Task tool. All routing judgment lives in this node. When a strategy runs, it is **composed
from surviving CLI primitives** — `agent resolve` (read the def's tags), `mux doctor` (probe the
multiplexer), `unit spawn` + `mail await` (the channel path), `unit nudge` (the doorbell wake), and
the caller's **own** harness Task tool (the subagent path). There is no `dispatch` command group:
`dispatch prep`, `dispatch channel`, `dispatch collect`, the result file, and `Store.result` were all
dropped — the node composes the primitives directly.

This node also covers `subagent-backend-governance` — the concrete three-step procedure the
**subagent** strategy runs once picked: resolve the agent def → invoke the caller's own Task tool →
take the subagent's **Task-result** (its own final returned message) as the verdict. There is no
`prep`/`collect`, no result file, and no schema-validation step; it is a sub-procedure of this
behavior, not a separate capability.

It further covers `relay-governance` — the **report/ask contract** orthogonal to strategy choice:
once a result (or an unanswerable question) exists, how it gets home is keyed on the *reporting
agent's own lifecycle*, not on which strategy dispatched it. A framed callee (Task-spawned subagent,
or a peer a spawner awaits) returns `needsInput` up its frame; a **bare top-level / cron** session
with no frame pushes `mail send` to the standing owner and exits, and the report surfaces into the
human's next root session (the CLI's `surfacing` node). This is where the headless "batch needs-input
and relay" behavior lives now — `dispatch-governance` and `headless-legate` load it rather than
restating it. `relay-governance` states transport only; the standing owner identity, owner mail, and
surfacing are the sibling `cyberlegion` CLI's mechanism.

`relay-governance` also carries the **receive side**: how a mid-mission receiver triages a relayed
steer whose parts sit at different authority levels. The receiver **decomposes by authority level**
— an in-scope refinement (testable against the receiver's **own** frozen spec / CR acceptance /
leash) adopts **in-band** with no provenance required, while cross-cutting doctrine escalates up the
relay for ratification, never adopted on a peer's say-so. Bundle-adopt and bundle-reject are both
anti-patterns. The root is the **provenance principle**: authority over peer mail cannot be
established (a faithful relay and a fabricated authority are indistinguishable), so a receiver acts
only on what it can verify against its own loaded contract — which is also why a ratification
embedded in relayed mail is invalid (the relayed-ratification seam).

## Use Cases

**Fit:** partial

**Subject** — given an intent to fulfill a role with a brief, deciding whether that role runs as a
warm interactive peer (**channel**), a cold one-shot subagent (**subagent**), or inline in the
caller's own session (**run-inline**) — and executing that choice by composing the surviving
`cyberlegion` CLI primitives.

**Non-goals** — the CLI primitives themselves (`agent resolve`, `mux doctor`, `unit spawn`,
`mail await`, `unit nudge` — those are the sibling `cyberlegion` CLI project); auto-routing inside
the CLI (there is no `--backend auto` — the CLI never chooses on its own); a mid-flight strategy
switch once one is picked; structured verdict-schema validation of the result (deferred to a future
`mail --verdict-schema` capability, absent today).

| Behavior | Trigger | Outcome |
|---|---|---|
| **resolve tags + environment** | any dispatch intent reaches this node | `agent resolve <R>` reads `warm`/`interactive`; `mux doctor` reads multiplexer presence |
| **pick channel** | `warm` + `interactive` + a multiplexer is present | compose `unit spawn --agent R --brief-file B --at <placement>` then `mail await --thread <t>` — a warm peer that can converse and mail back over rounds |
| **pick run-inline (attended)** | `warm` + `interactive` + no multiplexer, in-session | returns a `run-inline` verdict; the caller does the work itself — no cold subagent substitute |
| **run-inline has no seat (headless)** | `warm` + `interactive` + no multiplexer, under `headless-legate` | the Legate cannot run the work itself; returns `needsInput` naming the role + brief for its own relay to resolve |
| **pick subagent** | `interactive` unset (`false`) — a cold, one-shot role (either `warm` value) | realized via `subagent-backend-governance`: resolve the def → caller's **own** Task tool → the Task-result is the verdict (no result file) |
| **reject an unroutable def** | `interactive` set but `warm` unset (`false`) | **fail loud** naming the def + the contradictory tags — an `interactive` role must be `warm`, a cold one-shot must not be `interactive`; never swept into **subagent**, never a `needsInput` (a malformed def is an author bug) |
| **choose the channel wake sub-mode** | channel was picked | bounded await (A-loop) by default; A-prime when a Claude-Code background task is observable; doorbell (B, `unit nudge` + `mail await`) only behind a **verified** mux; never a doorbell when mux is `none` |
| **fan out N briefs (headless only)** | `headless-legate` receives a batch of briefs | resolves and runs each independently; subagent dispatches may run concurrently, channel dispatches are capped by the environment's multiplexer |
| **report the result uniformly** | any strategy completes | returns a `DispatchResult` (`strategy`, `id`, `verdict`, `result`, `needsInput`) the caller handles the same way regardless of strategy |
| **the `subagent \| channel` seam** | a dependent (e.g. SDD) needs a role fulfilled | the dependent states intent only (role, brief, verdict schema) — never pins a literal command name — and this node decides the mechanism |
| **relay by lifecycle** (`relay-governance`) | a headless agent has a result or an unanswerable question | framed callee → return `needsInput`; bare top-level/cron → `mail send` to the standing owner + exit; owner report surfaces to the human, read is a deliberate `mail ack --owner` |
| **decompose a received steer** (`relay-governance`) | a relayed steer reaches a mid-mission receiver | split by authority level: in-scope refinement (verifiable against the receiver's own frozen spec/leash) adopts in-band; cross-cutting doctrine escalates for ratification; never bundle-adopt or bundle-reject |
