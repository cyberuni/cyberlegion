---
status: approved
project-path: packages/cyberlegion
approval:
  spec:
    verdict: approve
    by: unional
    cause: clearance
    why:
      floor: clearance — CR-4 re-opened three frozen contracts. `dispatch/` retired entirely (result-slot dissolved: prep/collect/channel/verdict-schema); `agent.feature` narrowed (realizeSubagentInstruction group removed — cold-subagent instruction now composed caller-side from the resolve payload); `mux.feature` narrowed (selectWakePath group removed — routing relocates to the Legate plugin per CR-2 resolution #3). Design pre-authorized by the human (2 forks answered: dissolve dispatch; delete verdict validation now). agent + mux re-frozen this gate.
      blast: high — deletes a whole capability node + narrows two; the CLI's public dispatch/result surface is removed (BREAKING at deliver). No new capability authored — Task-result + the untouched frozen mail/wait await cover the dropped return paths.
      novelty: low — a deletion/relocation aligning to the established charter (mechanism→CLI, routing→plugin); no new node-shape.
      confidence: high — cold sdd-spec-judge ALIGNED (oracle/builder/architect all PASS, no blocker); check-spec-state + check-suite green; retired dispatch contract carried into migration-map for CR-5.
      judge: cold sdd-spec-judge — oracle/builder/architect all PASS; ALIGNED true; two non-blocking advisories (stale mail/wait pointer; carry-forward done).
      cr: cyberlegion-cli-realign (CR-4)
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
