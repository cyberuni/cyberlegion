---
status: implemented
project-path: packages/cyberlegion
approval:
  impl:
    verdict: approve
    by: agent
    cause: dimension
    why:
      floor: none
      blast: low — a command-string change in install.ts + a new opt-in init `--pin` flag; the upsert migration matcher rewrites a legacy bare entry in place (never duplicates); 295/295 cyberlegion tests, full pnpm verify 19/19.
      novelty: low — faithful impl of the frozen npx-form scenarios; `hookTarget` normalization collapses bare/unpinned/pinned to one target so re-init always rewrites in place.
      confidence: high — cold sdd-impl-judge: all scenarios PASS, IMPLEMENTATION_PASS true, exercise-backstop confirmed (make hookCommand ignore pin → the --pin test fails; drop the rewrite-in-place branch → the migration test fails); diff scoped to install.ts/cli.ts. Non-blocking follow-ups: a pre-existing verify-scenarios.mts path-resolution bug (scenario-bridge unusable for cyberlegion until fixed); the deferred malformed-`--pin` validation scenario.
      judge: cold sdd-impl-judge — all scenarios PASS, IMPLEMENTATION_PASS true, exercise-backstop confirmed.
      cr: hook-npx-pin
  spec:
    verdict: approve
    by: agent
    cause: clearance
    why:
      floor: clearance — re-opened two frozen contracts (ratified by the user's approval of the cyberlegion surfacing-hook plan): mail/surface/surface.feature's dedicated-command scenario generalized (exact bare string → "runs the dedicated mail hook --event, not a generic exec", ceding the npx-prefix specifics to init); init/init.feature's two SessionStart-registration scenarios rewritten from the bare form to `npx cyberlegion mail hook --event`. Both re-frozen this gate.
      blast: low — a command-string form change to the surfacing hook plus a new opt-in `--pin` flag; additive pin/unpin/legacy-migration scenarios; no capability removed. Fixes a deployability gap (the bare command needed a global install; cyberlegion is unpublished + unlinked at the repo root).
      novelty: low — aligns cyberlegion to the repo hook convention (`npx <pkg>@<version>`); the pinned version is injected by the init skill (Part C, via the bundle-emitted .plugin/pins.json), not runtime-read from the binary.
      confidence: high — cold sdd-spec-judge ALIGNED (oracle/builder/architect all PASS, no blocker). One non-blocking content gap (no malformed-`--pin` validation scenario) deferred as a follow-up — the version comes from the trusted bundle-stamped pins map, not free user input. legion-publish dependency: the npx pin is dormant until cyberlegion publishes (not a defect).
      judge: cold sdd-spec-judge — oracle/builder/architect all PASS; ALIGNED true; non-blocking: defer the `--pin` validation scenario.
      cr: hook-npx-pin
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
