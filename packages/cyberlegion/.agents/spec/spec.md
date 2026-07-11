---
status: implemented
project-path: packages/cyberlegion
approval:
  impl:
    verdict: approve
    by: unional
    cause: dimension
    why:
      floor: none — no frozen scenario weakened; the code fixes (tmux `new-window -d`, herdr `tab create --no-focus`) satisfy the re-frozen no-focus-steal contract.
      blast: low — `unit spawn --at` placement default (pane:right → tab) + herdr `tab` fidelity fix + dropping the `window` value; scoped to the `mux/` node's two `console/` adapters + the CLI option. 300/300 cyberlegion tests; root `pnpm verify` 19/19.
      novelty: low — teaches the herdr adapter its existing native `tab create` primitive and adds `-d` to the tmux tab path; tmux already mapped `tab` → `new-window`.
      confidence: high — cold sdd-impl-judge IMPLEMENTATION_PASS true; every frozen placement scenario verified with exercise-backstop (drop `-d` / drop `--no-focus` / revert the default → a test fails); no regression in the unchanged mux scenarios; diff scoped to placement.
      judge: cold sdd-impl-judge — IMPLEMENTATION_PASS true; all placement scenarios PASS, exercise-backstop confirmed.
      cr: at-default-tab
  spec:
    verdict: approve
    by: unional
    cause: dimension
    why:
      floor: none — the one frozen-scenario rewrite (`omitting --at defaults to pane:right` → `tab`) is a ratified re-open, a value change rather than a weakening/deletion of coverage; the user explicitly requested the default flip. The other three touched mux scenarios are purely additive (self-clearing).
      blast: low — the `unit spawn --at` placement default (pane:right → tab) plus the herdr-adapter fidelity fix it depends on (teach `tab` its native `herdr tab create`, previously mis-routed to a split) and dropping the redundant `window` value; scoped to the `mux/` node and the `console/` adapters.
      novelty: low — flips a documented default and wires the herdr adapter to its existing native `tab create` primitive; tmux already mapped `tab` → `new-window`. Vocabulary aligned to the canonical Session › Workspace › Tab › Pane concepts, captured as README reference.
      confidence: high — cold sdd-spec-judge ALIGNED (oracle/builder/architect all PASS, no open markers); added a focus-fidelity scenario to close the judge's one non-blocking content gap.
      judge: cold sdd-spec-judge — oracle/builder/architect all PASS; ALIGNED true.
      cr: at-default-tab
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
