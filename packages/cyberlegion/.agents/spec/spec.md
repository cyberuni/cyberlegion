---
status: implemented
project-path: packages/cyberlegion
approval:
  impl:
    verdict: approve
    by: agent
    cause: dimension
    why:
      floor: none — 5 additive scenarios on the frozen `mail/core.feature` for `mail read <id> --ack` (addOnly — freeze self-clears); no frozen scenario weakened.
      blast: low — new `readAck` in `message.ts` composing the existing `listInbox`/`ackMessage` primitives, plus a `--ack` branch inside the existing `mail read` command (bare-read path untouched); no registry/worktree/store-schema change. Root `pnpm verify` green (20/20); cyberlegion 389 tests green; dist rebuilt.
      novelty: low — `mail read <id> --ack` reads and consumes in one atomic step. Idempotent — always prints the body, acks only when still unread, so an already-acked message prints the body and succeeds (`acked: false`) rather than erroring like a bare `mail ack`; unknown id still errors; composes with `--owner`.
      confidence: high — cold sdd-impl-judge IMPLEMENTATION_PASS true; all 5 new frozen scenarios PASS with independently re-derived oracles, idempotence genuinely non-erroring and distinct from double-ack, `--owner` codepath really exercised.
      judge: cold sdd-impl-judge — IMPLEMENTATION_PASS true; all 5 read --ack scenarios PASS; no regression on the pre-existing frozen suite.
      cr: github-173-mail-read-ack
  spec:
    verdict: approve
    by: agent
    cause: dimension
    why:
      floor: none — additive to `mail/core.feature` (gherkin-cli addOnly:true, 5 added / 0 modified / 0 removed); stays `@frozen`, no re-open.
      blast: low — one new atomic read+ack CLI op on an existing behavioral node; `README.md` synced (new Use-Case bullet + scenario-map row + corrected owner read-state line).
      novelty: low — combined `mail read --ack` collapses read-then-separately-ack into one round-trip; the two-step peek path (`mail read` without `--ack`) is unchanged.
      confidence: high — cold sdd-spec-judge ALIGNED true (oracle/builder/architect all PASS) after closing two blocking gaps (owner-idempotent scenario + README sync); no open markers.
      judge: cold sdd-spec-judge — oracle/builder/architect all PASS; ALIGNED true.
      cr: github-173-mail-read-ack
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
