---
status: implemented
project-path: packages/cyberlegion
approval:
  impl:
    verdict: approve
    by: agent
    cause: dimension
    why:
      floor: none — the implementation satisfies every new frozen scenario and weakens no existing one; the mux re-open's narrowing was already cleared at the spec gate (pre-authorized by #161).
      blast: low — a placement-only change: `session.ts` resolves `--at` by spawn mode (new-worktree → `workspace`, `--cwd` → `tab`), `cli.ts` drops the hard `tab` default, `console/session.tmux.ts` maps `workspace` → `new-window -d` and removes the `new-session` mapping entirely. herdr adapter untouched; no registry/mail/worktree-lifecycle/CLI-contract bleed (git diff --stat: 3 source files + 2 test files).
      novelty: low — flips one spawn default and remaps one tmux verb; reinforces #158's `select-window` beam (a ship lands in a visible window, never a detached session). Judged on the tree rebased onto origin/main (be7f3092).
      confidence: high — cold sdd-impl-judge IMPLEMENTATION_PASS true; all 7 new frozen scenarios BOUND and discriminating (the tmux `workspace` test fails against the pre-fix `new-session` mapping; the new-worktree-default test fails if the default were still `tab`, verified by tracing the diff's pre-fix counterfactual); herdr nested-workspace + `--at tab`/pane + the `--at accepts only ...` validation + #158 focus-beaming all regression-confirmed untouched; `new-session` fully removed (grep shows only comments + negative assertions). cyberlegion 364 tests green; root `pnpm verify` green (20/20 tasks).
      judge: cold sdd-impl-judge — IMPLEMENTATION_PASS true; every frozen placement scenario PASS; scope confined to placement (session.ts/cli.ts/tmux adapter); no blocker, no unbound scenario.
      cr: github-161-spawn-visible-space
  spec:
    verdict: approve
    by: agent
    cause: dimension
    why:
      floor: none — new `mail/doorbell` node is a fresh `@frozen` feature; the 6 `mail/core` Bunker scenarios are additive (gherkin-cli diff addOnly:true, self-clearing, stay `@frozen`, no re-open); no frozen scenario weakened.
      blast: low-medium — new behavioral `mail/doorbell` node (push-doorbell-on-send) + additive `mail/core` Bunker-addressing scenarios; reuses the shipped #150 nudge submit-verify path and existing store primitives (`getMainPane`/`findPaneByAgentId`); touches no registry/worktree path.
      novelty: low-medium — best-effort push doorbell layered over durable delivery: a peer's live pane or the Bunker's bound main pane is rung on send; no-live-target (headless / no main pane / ring past cap) is a legitimate no-op, never a send failure. Aligns with sibling #158's attach-relative no-op framing; #158's verify-effect-or-fail-loud rule is DEFERRED to a follow-up CR, so this notes the seam.
      confidence: high — fresh cold sdd-spec-judge ALIGNED (oracle/builder/architect all PASS) after one judge-iteration correction round; no open markers; check-suite + check-spec-state OK.
      judge: cold sdd-spec-judge — oracle/builder/architect all PASS; ALIGNED true (2nd pass, post-correction).
      cr: github-159-doorbell-bunker
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
| [`mail/`](./mail/README.md) | durable inter-agent messaging — plain send/inbox/read/ack/delete plus the Bunker owner-inbox path (`mail/core`), thread correlation and bounded await/watch (`mail/wait`), hook injection and owner-mail surfacing / the pull side (`mail/surface`), waking the recipient on delivery / the push-side doorbell (`mail/doorbell`) |
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
