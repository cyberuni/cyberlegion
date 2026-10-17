---
status: approved
project-path: packages/cyberlegion
approval:
  spec:
    verdict: approve
    by: unional
    cause: clearance
    why:
      floor: clearance — granted in-session by the owner before drafting (ledger seq 1) and re-affirmed at this ratification. The CR narrows one frozen mux scenario (the harness-agnostic no-multiplexer refusal now applies to non-claude harnesses only); every other frozen suite it touches (unit/registry, mail/doorbell) changes additively.
      blast: medium — spec + suite only at this gate, across one new node (unit/background, 39 scenarios) and three existing ones (mux narrowed + 3, unit/registry + 4, mail/doorbell + 8). The implementation it admits adds a second kind of session backend beside the multiplexers.
      novelty: high — a pane-less backend is new to the legion; every per-unit operation needed an answer for a unit with no pane. The facts it rests on were probed live against Claude Code 2.1.299 rather than assumed (ADR-0036).
      confidence: high — four cold spec-judge rounds. R1 short-circuited at the governance pre-flight (a relayed declaration missed one governance). R2 found the background node colliding with frozen close, stop, and doorbell contracts plus uncovered failure edges. R3 verified those fixes and found they created an undefined state (active record, stopped session); the owner ruled that state invalid and out of contract rather than open a further round. R4: oracle/builder/architect all PASS, ALIGNED true, no failing scenarios. Two advisory wording points applied after R4 without behavior change.
      hitl: owner decisions taken live — automatic fallback over an opt-in flag; ringing a busy unit deferred to issue 190; a claude spawn inside wezterm/zellij still refused; an active record whose session has no running process (stopped from outside, left by a failed resume, or crashed) ruled invalid, with ringing it still refused as not idle.
      reopen: during deliver a live end-to-end run against real Claude Code showed the ring keyed idleness on the listing's task state instead of its turn status, and two other frozen inputs were unconstructible (close Givens naming a leased worktree; a non-existent --command CLI flag). The owner approved re-opening unit/background and mail/doorbell in-session; a cold re-open judge round passed all three lenses and confirmed the status repair fails the pre-repair code. One additive scenario (closing a leased background unit) was added at the owner's request before re-freezing.
      reopen-2: a second live run showed a session stopped after its turn finished keeps state done with no status, so stop is now verified by the absence of a running process, whatever the state. The owner approved re-opening unit/background in-session and extended the invalid-state ruling to any active record whose session has no running process (a failed resume, an outside claude stop, or a self-ended process): show and prune are unspecified for it, while ringing it is refused as neither busy nor idle. Three cold judge rounds; the last passed all three lenses.
      cr: claude-background-backend
---

# cyberlegion — the CLI: harness-agnostic agent spawn and messaging

> Root project spec — the **descriptive** top index for the `cyberlegion` **CLI** (the npm package at
> `packages/cyberlegion`). Behaviors live in the capability folders below.

`cyberlegion` is the metaphor-free foundation both SDD and the `cyberfleet` fleet-persona layer depend
**up** on: it spawns and reaps agent sessions and carries durable inter-agent mail. A caller delegates
work and awaits a verdict by composing those primitives — spawn a peer and await its **mail**, or run
a cold subagent and take its **Task result** — not through any CLI result-slot. It carries **no** fleet
metaphor and **no** SDD knowledge.

The CLI is **pure mechanism** — dumb hands a caller (the Legate routing brain, in the `cyberlegion`
plugin) composes. It never selects a backend and never invokes a harness subagent tool; routing
(warm-peer vs cold-subagent vs run-inline) is the caller's judgment.

State lives in a global hub at `~/.agents/cyberlegion/` (identity + mail data, addressable
across project and worktree boundaries) plus a project-local `<project>/.agents/cyberlegion/` (tracked
marker only). A spawned unit's own git worktree is leased from the worktree library
(`@cyberuni/agent-harness/worktrees`) and checks out as a **sibling** of the primary checkout
(`<parent>/<repo>.worktrees/<repo>-<n>`), never nested inside the primary's own tree. All
mailbox + registry access goes through a domain `Store` interface (a `FileStore` impl today).

## Capabilities

| Node | Concern |
|---|---|
| [`mux/`](./mux/README.md) | the unit-agnostic pane abstraction — backend selection, placement, multiplexer detection |
| [`unit/`](./unit/registry/README.md) | the instance registry (`unit/registry`) + warm session lifecycle (`unit/lifecycle`) + runtime stop/restart/rebind and the read-only runtime view (`unit/runtime`) + a unit hosted in a Claude background session when no multiplexer runs (`unit/background`) + the units mirrored into cynapse as participants (`unit/participants`) |
| [`service/`](./service/endpoint/README.md) | project services (ADR-0033) — the endpoint record, a service's durable address that outlives every owner (`service/endpoint`) + the fenced ownership lease: reserve, bind, release, handoff, and the generation check (`service/lease`) |
| [`mail/`](./mail/README.md) | durable inter-agent messaging — plain send/inbox/read/ack/delete (`mail/core`), thread correlation and bounded await/watch (`mail/wait`), hook injection and owner-mail surfacing / the pull side (`mail/surface`), waking the recipient on delivery / the push-side doorbell (`mail/doorbell`) |
| [`prompt-guard/`](./prompt-guard/README.md) | every ring into a peer's input box first waits out a human's unsent draft — typed around it once it sits idle, never typed over while it changes |
| [`agent/`](./agent/README.md) | resolve reusable agent definitions |
| [`attach/`](./attach/README.md) | the human's read-pane — an attention pointer to the hub's main pane |
| [`init/`](./init/README.md) | the onboarding front door — auto-detect the harness and register the surfacing hook (owns the per-harness installer) |
| [`admin/`](./admin/README.md) | hub-state maintenance (`admin migrate`) |
| [`metaphor-free/`](./metaphor-free/README.md) | the vocabulary-boundary guard — a mechanical check that fails when a banned fleet-persona term appears unsanctioned in the CLI, the plugin layer, or the plugin's project spec (enforces the metaphor-free charter above) |

> CR-2 (`cyberlegion-cli-realign`, ADR-0024) realigned this tree to command groups + one node per
> real architectural layer (`mux`); `identity`/`session` dissolved into `unit`, `surfacing`/`wake`
> dissolved into `mail`/`mux`/`init`, `attach`/`admin` are new. **CR-4 dissolved `dispatch/`
> entirely**: the result-slot (`prep`/`collect`/`Store.result`) is dropped — a caller composes
> `unit spawn` + `mail await` (channel) or a cold Task subagent that returns via Task-result — and the
> routing brain (warm-peer vs subagent vs run-inline) lives in the Legate plugin, not the CLI. See
> `.agents/plans/cyberlegion-cli-realign.migration-map.md` for the full scenario→target contract.

<!-- BEGIN generated: by-concept (project-spec/concept-index) -->

## By concept

> Generated from `concept:` frontmatter by `project-spec/concept-index` — do not edit by hand.

| Concept | Facets |
|---|---|
| `cyberlegion` | `admin/` (behavior) · `agent/` (behavior) · `attach/` (behavior) · `init/` (behavior) · `mail/` (index) · `mail/core/` (behavior) · `mail/doorbell/` (behavior) · `mail/surface/` (behavior) · `mail/wait/` (behavior) · `metaphor-free/` (behavior) · `mux/` (behavior) · `prompt-guard/` (behavior) · `service/endpoint/` (behavior) · `service/lease/` (behavior) · `unit/background/` (behavior) · `unit/lifecycle/` (behavior) · `unit/participants/` (behavior) · `unit/registry/` (behavior) · `unit/runtime/` (behavior) |

<!-- END generated: by-concept -->
