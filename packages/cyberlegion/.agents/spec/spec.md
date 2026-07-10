---
status: approved
project-path: packages/cyberlegion
approval:
  spec:
    verdict: approve
    by: unional
    cause: clearance
    why:
      floor: clearance — two frozen contracts were re-opened and re-frozen this CR — unit/registry's who scenario (merged the old session list, +pane field, "N units" aggregate) and mail/surface's install group (removed, deduped into init with added codex coverage). Both narrowing/rewrite re-opens were ratified in the CR-2 resolutions (res#1 who-merge, res#2 install-dedup) and by this gate ratification. No Compatibility bump (spec-only this CR — the CLI is unchanged until deliver). No Conflict.
      blast: high — whole-tree realignment (ADR-0024)- identity->unit/{registry,lifecycle}, session dissolved, wake/surfacing dissolved into mail/{wait,surface}+mux, new mux/attach/admin nodes; 152 scenarios relocated. dispatch/ and agent/ untouched.
      novelty: high — first project-spec realignment on cyberlegion; the sub-node split (unit, mail) is a new node-shape for this spec.
      confidence: high — command-noun renames are freeze-preserving reconciles (ADR-0021); check-spec-state/suite/structure all green; no oversized node.
      judge: cold sdd-spec-judge — oracle PASS; architect/builder returned change (not reject); all blocking findings fixed (illegal spec-type, freeze-legality re-open, 4 README syncs) and re-verified green.
      cr: cyberlegion-cli-realign
---

# cyberlegion — the CLI: harness-agnostic agent spawn, messaging, and dispatch

> Root project spec — the **descriptive** top index for the `cyberlegion` **CLI** (the npm package at
> `packages/cyberlegion`). Behaviors live in the capability folders below.

`cyberlegion` is the metaphor-free foundation both SDD and the `cyberfleet` fleet-persona layer depend
**up** on: it spawns and reaps agent sessions, carries durable inter-agent mail, and provides the
result-slot primitives a caller uses to delegate work and await a verdict. It carries **no** fleet
metaphor and **no** SDD knowledge.

The CLI is **pure mechanism** — dumb hands a caller (the Legate routing brain, in the `cyberlegion`
plugin) composes. It never selects a backend and never invokes a harness subagent tool; routing
(warm-peer vs cold-subagent vs run-inline) is the caller's judgment.

State lives in a global hub at `~/.agents/cyberlegion/` (identity + mail + dispatch data, addressable
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
| [`dispatch/`](./dispatch/README.md) | result-slot primitives for delegating work and awaiting a verdict |

> CR-2 (`cyberlegion-cli-realign`, ADR-0024) realigned this tree to command groups + one node per
> real architectural layer (`mux`); `identity`/`session` dissolved into `unit`, `surfacing`/`wake`
> dissolved into `mail`/`mux`/`init`, `attach`/`admin` are new. `dispatch/` is out of scope (moves to
> the Legate plugin in CR-4). See `.agents/plans/cyberlegion-cli-realign.migration-map.md` for the
> full scenario→target contract.
