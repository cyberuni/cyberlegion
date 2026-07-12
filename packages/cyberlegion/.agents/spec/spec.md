---
status: implemented
project-path: packages/cyberlegion
approval:
  impl:
    verdict: approve
    by: agent
    cause: dimension
    why:
      floor: none — additive boot-race scenarios only; no frozen scenario weakened.
      blast: low-medium — a new `console/nudge.ts` verify+retry loop above the adapters + a bare-Enter `submit` primitive on the `SessionAdapter` interface (herdr `pane send-keys Enter`, tmux `send-keys Enter`) + the `unit nudge` action made async; touches no registry/worktree path. Judged on the tree rebased onto origin/main (incl. cr128 PR #152). Root `pnpm verify` 19/19; cyberlegion 356 tests green.
      novelty: low-medium — submit-then-verify-then-retry: `send` once, read the pane back, flush the staged buffer (bare Enter, never re-typing) up to a bounded cap, fail loud if the turn is never taken; verify anchor is the caller's own staged text (harness-agnostic), mirroring the existing `wake/await` injectable-`sleep` poll idiom.
      confidence: high — cold sdd-impl-judge IMPLEMENTATION_PASS true; all 4 frozen scenarios PASS with independently re-derived oracles and exercise-backstopped by two source mutations (submit→send, remove early-return) that each broke the bound tests — closing the prior UNBOUND nudge gap. Fail-loud propagation to `exit(1)` confirmed structurally.
      judge: cold sdd-impl-judge — IMPLEMENTATION_PASS true; every boot-race scenario PASS; diff confined to the nudge behavior, no bleed.
      cr: 150-nudge-boot-race
  spec:
    verdict: approve
    by: agent
    cause: dimension
    why:
      floor: none — the 4 nudge boot-race scenarios are purely additive to the frozen `lifecycle.feature` (gherkin-cli diff addOnly:true, self-clearing, stays `@frozen`, no re-open); existing scenarios untouched.
      blast: low-medium — hardens the existing `nudge` verb in the `unit/lifecycle` node; contract is adapter-general (herdr + tmux) and lives above the adapter as a verify+retry loop plus a bare-submit primitive; touches no registry/worktree path.
      novelty: low — submit-then-verify-then-retry (issue #150 option b) chosen over verify-readiness-before-submit (option a) for adapter-generality and a harness-agnostic verify anchor (the caller's own staged text); fail-loud on cap exhaustion kills the silent idle-at-$0.00 mode.
      confidence: high — cold sdd-spec-judge ALIGNED (oracle/builder/architect all PASS); no open markers; check-suite + check-spec-state OK.
      judge: cold sdd-spec-judge — oracle/builder/architect all PASS; ALIGNED true.
      cr: 150-nudge-boot-race
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
