---
status: implemented
project-path: packages/cyberlegion
approval:
  impl:
    verdict: approve
    by: unional
    cause: dimension
    why:
      floor: none newly weakened — the one removed frozen scenario (nudge `empty keystroke`) is a ratified re-open replaced by two scenarios covering more ground (default message + `--message` override), not a coverage cut; Clearance authorized in-session.
      blast: low — `unit nudge` now delivers a check-mail message (default, `--message` override) instead of `send(target, '')`; scoped to the nudge command block in `cli.ts` (+13/-3), the session adapters unchanged. 315/315 cyberlegion tests.
      novelty: low — corrects a factual bug (an empty ring is a no-op on the herdr adapter — `pane run <id> ""` submits nothing — and a live agent session takes a turn only on real input).
      confidence: high — cold sdd-impl-judge IMPLEMENTATION_PASS true; both nudge scenarios verified by oracle re-derivation. Noted gap: both scenarios UNBOUND on the junit bridge (reverting to `''` still passes 315/315), so verdict rests on source re-derivation — follow-up CR filed to bind them with a CLI test.
      judge: cold sdd-impl-judge — IMPLEMENTATION_PASS true; both nudge scenarios PASS, diff scoped, no bleed.
      cr: nudge-carries-message
  spec:
    verdict: approve
    by: unional
    cause: clearance
    why:
      floor: Clearance — the removed frozen `empty keystroke` nudge scenario is a narrowing (deletion), authorized in-session by the human conductor; replaced by two scenarios covering the default and `--message` paths (net +1, more ground than the one removed).
      blast: low — scoped to the `unit/lifecycle` node (README + `lifecycle.feature`); 24 of 26 scenarios unchanged.
      novelty: low — corrects the doorbell contract from a no-op empty keystroke to a delivered message pointing the peer at its inbox.
      confidence: high — cold sdd-spec-judge ALIGNED (oracle/builder/architect all PASS, no open markers). Non-blocking observation: nudge/focus/read carry no error-case scenario (pre-existing gap symmetric across the cluster) — follow-up CR.
      judge: cold sdd-spec-judge — oracle/builder/architect all PASS; ALIGNED true.
      cr: nudge-carries-message
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
