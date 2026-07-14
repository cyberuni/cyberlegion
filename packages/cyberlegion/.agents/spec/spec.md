---
status: approved
project-path: packages/cyberlegion
approval:
  impl:
    verdict: approve
    by: agent
    cause: dimension
    why:
      floor: none — no frozen scenario narrowed (4 additive first-turn scenarios only); mechanism, not routing.
      blast: low — new `wakeSpawn` + `SPAWN_DOORBELL` in `console/doorbell.ts` (reuses the `nudge` submit-verify primitive, mirrors `wakeRecipient`), plus a `--no-wake` flag and an async best-effort post-spawn ring in the `unit spawn` command; `spawn()` in `session.ts` unchanged. cyberlegion 404 tests green on the rebased tree; dist rebuilt.
      novelty: low — `unit spawn` now completes turn-delivery (a best-effort first-turn doorbell over the boot-race submit-verify path) atop payload-delivery (the brief file); `--no-wake` opts out; a ring that never completes warns, never fails the spawn.
      confidence: high — cold sdd-impl-judge IMPLEMENTATION_PASS true; all 4 frozen scenarios PASS with independently re-derived oracles; judge mutation-tested the suite (non-tautological). One non-blocking test-completeness obs (no CLI-level e2e for the spawn glue) accepted as a follow-up, not a contract gap.
      judge: cold sdd-impl-judge — IMPLEMENTATION_PASS true; all 4 first-turn scenarios PASS; no regression on the pre-existing frozen suite.
      cr: github-188-spawn-delivers-turn
  spec:
    verdict: approve
    by: agent
    cause: dimension
    why:
      floor: none — 10 additive scenarios on `unit/registry/registry.feature` + 5 on `mail/doorbell/doorbell.feature` (gherkin-cli addOnly:true, 0 modified / 0 removed on both); both stay `@frozen`, no re-open.
      blast: low — spec + suite only. `unit/registry` (presence pointer + spawn-capability gate + live-only resolution), `mail/doorbell` (presence-aware ring + focus-gated main-pane fallback), `attach` (README non-goal only). Composes existing neutral primitives (`kind: standing`, `probeMultiplexer`, the ratified peer-vs-human ring split).
      novelty: low — the split falls out of already-ratified doctrine, not against it: the doorbell already rings a peer regardless of focus because "a peer is an agent expected to take the turn, not a human whose attention is the scarce resource". A bound presence IS an agent → inherits the peer rule; the focus gate (#172) stays on the human read-pane.
      confidence: high — two cold sdd-spec-judge rounds. R1 ALIGNED false, 4 findings all accepted+fixed (a literal "seat" metaphor leak ×2; an internal-call assertion; an unfalsifiable subagent scenario → falsifiable 2×2 Outline; a pre-existing "ship" leak on an already-+line). R2 fresh-context ALIGNED true, all three lenses PASS, metaphor grep clean on every added line, addOnly independently re-verified.
      judge: cold sdd-spec-judge round 2 — oracle/builder/architect all PASS; ALIGNED true; ship.
      hitl: the two load-bearing decisions (handle `council`; presence split from the read-pane) were ratified live by the owner before drafting; the landing stays the owner's at the PR.
      cr: github-212-standing-presence
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
| [`mail/`](./mail/README.md) | durable inter-agent messaging — plain send/inbox/read/ack/delete (`mail/core`), thread correlation and bounded await/watch (`mail/wait`), hook injection and owner-mail surfacing / the pull side (`mail/surface`), waking the recipient on delivery / the push-side doorbell (`mail/doorbell`) |
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
