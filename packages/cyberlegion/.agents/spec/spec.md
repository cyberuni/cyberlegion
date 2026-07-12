---
status: implemented
project-path: packages/cyberlegion
approval:
  impl:
    verdict: approve
    by: agent
    cause: dimension
    why:
      floor: none — additive; the two new frozen focus scenarios are satisfied and no existing frozen scenario weakened.
      blast: low-medium — a real production fix to `SessionAdapter.focus` on both backends (herdr `pane get` → `workspace focus` → `tab focus`; tmux `list-panes -a` → `switch-client` → `select-window` → `select-pane`) + a per-backend `parsePaneLocation` helper; the `focus(exec, target): void` signature is unchanged (returns void, or throws on an unresolvable pane); no CLI-contract/registry/worktree/cyberfleet bleed. Judged on the tree rebased onto origin/main.
      novelty: low-medium — extends the single-pane focus into a workspace→tab→pane beam using herdr `pane get`'s already-returned `workspace_id`/`tab_id` (and the tmux `list-panes -F` equivalent); resolution runs BEFORE any switch, so an unresolvable pane throws ("could not be resolved to beam to") instead of reporting a false `focused` on a silent no-op. Best-effort within the switch commands; no observable-effect read-back (the broader "SessionAdapter verifies observable effect or fails loud" rule — a cr150 doctrine sibling — is deliberately deferred to a follow-up CR, see the plan combat log).
      confidence: high — cold sdd-impl-judge IMPLEMENTATION_PASS true; both new frozen scenarios PASS with independently re-derived oracles, exercise-backstopped (the tests' exact `calls`-array assertions fail against the pre-fix single-command code, verified vs `e0b90275^`); the #128 focus error scenarios stay BOUND+PASS, unaffected (`resolveTarget` still throws before the adapter); the CLI false-success path is structurally impossible (a throw skips the `focused:` emit → `exit(1)`). cyberlegion 359 tests green; root `pnpm verify` green.
      judge: cold sdd-impl-judge — IMPLEMENTATION_PASS true; all frozen focus scenarios PASS; scope confined to the two adapters (+ helpers); two advisory observations (the `session.ts` focus doc comment corrected in-session; per-adapter parse-failure sub-branch coverage accepted-as-is — complete across both adapter test files).
      cr: github-158-focus-cross-workspace
  spec:
    verdict: approve
    by: agent
    cause: dimension
    why:
      floor: none — the 2 focus-beaming scenarios are purely additive to the frozen `lifecycle.feature` (gherkin-cli diff addOnly:true, 2 added/0 modified/0 removed; self-clears, stays `@frozen`, no re-open); existing scenarios (incl. the frozen same-workspace focus and the #128 no-known-pane error case) untouched.
      blast: low-medium — a real production change to `SessionAdapter.focus` on both backends: resolve the target pane's own `workspace_id` + `tab_id` from the backend and drive the full beam (herdr `workspace focus` → `tab focus` → pane; tmux `switch-client` → `select-window` → `select-pane`), plus a fail-loud-on-unresolvable-pane path. Touches only the two `console/session.*.ts` adapters (+ a parse helper); no registry/worktree/CLI-contract path.
      novelty: low-medium — extends the single-pane focus into a workspace→tab→pane beam using herdr `pane get`'s already-returned `workspace_id`/`tab_id` (and the tmux `list-panes -F` equivalent); the stale-pane fail-loud mirrors the #128 `resolveTarget` fail-loud floor, killing the silent-no-op / false-`focused` mode issue #158 flags. Best-effort within, no observable-effect re-read (lighter than nudge's verify loop).
      confidence: high — cold sdd-spec-judge ALIGNED (oracle/builder/architect all PASS); no open markers; gherkin-cli addOnly:true; check-spec-state + check-suite green.
      judge: cold sdd-spec-judge — oracle/builder/architect all PASS; ALIGNED true.
      cr: github-158-focus-cross-workspace
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
