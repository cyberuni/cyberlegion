---
status: implemented
project-path: packages/cyberlegion
approval:
  impl:
    verdict: approve
    by: agent
    cause: dimension
    why:
      floor: none — 6 additive error-case scenarios only; no frozen scenario weakened; no production code changed.
      blast: low — spec/suite/test/docs only; the guard already existed in `resolveTarget` (`cli.ts`); deliver added one e2e verification per new frozen scenario. Root `pnpm verify` 19/19; cyberlegion 347 tests green.
      novelty: low — mirrors the two frozen `unit clear` error scenarios; unresolvable ref → `no agent addressable`, no known pane → `no known session pane`, for each of focus/nudge/read.
      confidence: high — cold sdd-impl-judge IMPLEMENTATION_PASS true; all 6 scenarios PASS with independently re-derived oracles; the "nothing focused/delivered/scraped" clause is structurally guaranteed by guard-before-adapter ordering, and the no-pane tests register a genuine `pane:null` unit (not a tautology).
      judge: cold sdd-impl-judge — IMPLEMENTATION_PASS true; every new frozen scenario PASS; scope confined to spec/suite/test/docs, no drift.
      cr: github-128-unit-error-scenarios
  spec:
    verdict: approve
    by: agent
    cause: dimension
    why:
      floor: none — 6 error-case scenarios purely additive to the frozen `lifecycle.feature` (gherkin-cli diff addOnly:true, 6 added/0 modified/0 removed; self-clears, stays `@frozen`, no re-open).
      blast: low — spec/suite-only; mirrors the two frozen `unit clear` error scenarios; the guard already exists in `resolveTarget` (`cli.ts`) so no production code change is anticipated (deliver adds test coverage only).
      novelty: low — closes the builder-spec-governance error-case gap issue #128 flagged; 2 error cases × 3 ops (`focus`/`nudge`/`read`): an unresolvable/unregistered ref, and a registered unit with no known session pane.
      confidence: high — cold sdd-spec-judge ALIGNED (oracle/builder/architect all PASS); no open markers.
      judge: cold sdd-spec-judge — oracle/builder/architect all PASS; ALIGNED true.
      cr: github-128-unit-error-scenarios
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
marker only). A spawned unit's own git worktree checks out as a **sibling** of the primary checkout
(`<parent>/<repo>.worktrees/legion-<id6>`), never nested inside the primary's own tree. All
mailbox + registry access goes through a domain `Store` interface (a `FileStore` impl today).

## Capabilities

| Node | Concern |
|---|---|
| [`mux/`](./mux/README.md) | the unit-agnostic pane abstraction — backend selection, placement, multiplexer detection |
| [`unit/`](./unit/registry/README.md) | the instance registry (`unit/registry`) + warm session lifecycle (`unit/lifecycle`) |
| [`mail/`](./mail/README.md) | durable inter-agent messaging — plain send/inbox/read/ack/delete (`mail/core`), thread correlation and bounded await/watch (`mail/wait`), hook injection and owner-mail surfacing (`mail/surface`) |
| [`agent/`](./agent/README.md) | resolve reusable agent definitions |
| [`attach/`](./attach/README.md) | the human's read-pane — an attention pointer to the hub's main pane |
| [`init/`](./init/README.md) | the onboarding front door — auto-detect the harness and register the surfacing hook (owns the per-harness installer) |
| [`admin/`](./admin/README.md) | hub-state maintenance (`admin migrate`) |

> CR-2 (`cyberlegion-cli-realign`, ADR-0024) realigned this tree to command groups + one node per
> real architectural layer (`mux`); `identity`/`session` dissolved into `unit`, `surfacing`/`wake`
> dissolved into `mail`/`mux`/`init`, `attach`/`admin` are new. **CR-4 dissolved `dispatch/`
> entirely**: the result-slot (`prep`/`collect`/`Store.result`) is dropped — a caller composes
> `unit spawn` + `mail await` (channel) or a cold Task subagent that returns via Task-result — and the
> routing brain (warm-peer vs subagent vs run-inline) lives in the Legate plugin, not the CLI. See
> `.agents/plans/cyberlegion-cli-realign.migration-map.md` for the full scenario→target contract.
