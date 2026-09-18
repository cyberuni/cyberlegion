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

The subagent path's **mid-turn messaging rule is scoped by role, not by backend**. A **cold
one-shot dispatch** (a judge, a grader) takes no mid-run message — nothing reaches it between its
brief and its Task-result, which is what makes its verdict its own. An **owned unit realized as a
subagent** — a unit an owner is running, which happens to have no pane of its own — may be messaged
mid-turn by **its owner**, and those messages land as turns in the unit's own session, so they are
**orders**. Authority still **attenuates**: the owner passes on no more than it holds, and a Council
decision carried inside such a message is actionable only with all four of the decision verbatim,
where it was said, the relaying unit, and a scope covering the action and its target. This is the
owner's **positional** order channel down into a unit it is running — not the **lateral** peer mail
whose embedded ratification `relay-governance` holds invalid; the four parts make the claim
**well-formed and auditable after the fact**, they do not verify it in the moment and they widen
nothing — the decision's scope is still capped by what the owner itself holds. Depth-1 is unchanged: the existing depth-1
scenario already binds every unit realized via the subagent path, owned or cold.

`relay-governance` also carries the **receive side**: how a mid-mission receiver triages a relayed
steer whose parts sit at different authority levels. The receiver **decomposes by authority level**
— an in-scope refinement (testable against the receiver's **own** frozen spec / CR acceptance /
leash) adopts **in-band** with no provenance required, while cross-cutting doctrine escalates up the
relay for ratification, never adopted on a peer's say-so. Bundle-adopt and bundle-reject are both
anti-patterns. The root is the **provenance principle**: authority over peer mail cannot be
established (a faithful relay and a fabricated authority are indistinguishable), so a receiver acts
only on what it can verify against its own loaded contract — which is also why a ratification
embedded in relayed mail is invalid (the relayed-ratification seam).

That seam is keyed on the **relationship**, not on the transport alone. A **peer steer** — anything
relayed by a unit holding no authority over the receiver — is unchanged: its ratification claim is
invalid and the bundle-adopt / bundle-reject decomposition governs it. A decision relayed down the
**ownership chain** is adoptable **within its named scope and nothing adjacent**, and it is that
case only when **both** hold: the relaying unit is the receiver's own owner, **and** the decision
arrived on a **turn** in the receiver's own session. Either one alone leaves it a peer steer — mail
the receiver **fetched** stays content whatever it claims, and a turn placed by a non-owner supplies
no authority. It must carry **four parts**: the Council's verbatim words, where they were said, the
relaying unit, and its scope (one action on one target); a decision missing any part drops back to
escalate-for-ratification. It is **spent once acted on**, and authority **attenuates at every hop**
(no link passes on more than it holds).

Two limits are stated, not worked around. The rule is **not forgery-proof**: `unit nudge --message`
writes caller-controlled text into any addressable pane and records no caller identity, so position
is a structural fact about the Legion's shape rather than a proof. And a receiver **cannot detect**
a relay that passed on more than the relayer held — attenuation is sender-side discipline, not a
receiver-side check. Scope here is **one action on one target**; a sibling corpus that versions its
targets may add a revision part, but `dispatch` has no revision concept and does not carry one.

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
| **cold one-shot takes no mid-run message** | a judge or grader is realized via the subagent path | nothing reaches it between brief and Task-result — its independence is the reason the ban holds here |
| **an owner may message its own unit mid-turn** | an owned unit is realized as a subagent and its owner needs to change its course | the owner's mid-turn message lands as a turn in the unit's session and is an **order**; a non-owner acquires no such channel |
| **authority attenuates across the hop** | a mid-turn message from the owner carries a Council decision | actionable only with all four of the decision verbatim, where it was said, the relaying unit, and a scope covering action + target; otherwise it is the owner's own order, bounded by what the owner holds, and the remainder escalates |
| **the `subagent \| channel` seam** | a dependent (e.g. SDD) needs a role fulfilled | the dependent states intent only (role, brief, verdict schema) — never pins a literal command name — and this node decides the mechanism |
| **relay by lifecycle** (`relay-governance`) | a headless agent has a result or an unanswerable question | framed callee → return `needsInput`; bare top-level/cron → `mail send` to the standing owner + exit; owner report surfaces to the human, read is a deliberate `mail ack --owner` |
| **decompose a received steer** (`relay-governance`) | a relayed steer reaches a mid-mission receiver | split by authority level: in-scope refinement (verifiable against the receiver's own frozen spec/leash) adopts in-band; cross-cutting doctrine escalates for ratification; never bundle-adopt or bundle-reject |
| **adopt an ownership-chain decision** (`relay-governance`) | a decision relayed by the receiver's **own owner** **on a turn** in its own session, carrying the Council's verbatim words, where they were said, the relaying unit, and its scope | adoptable within the named scope and nothing adjacent; spent once acted on; attenuates at every hop; a missing part, fetched mail, or a turn from a non-owner each drop it back to escalate-for-ratification / peer-steer triage |
