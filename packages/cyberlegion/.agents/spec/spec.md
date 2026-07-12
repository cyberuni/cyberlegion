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
      floor: clearance (pre-authorized) — the frozen mux scenario `omitting --at defaults to tab` was re-opened and removed (a narrowing/rewrite, gherkin-cli 3 added/1 removed), pre-authorized by issue #161 which mandates flipping the new-worktree spawn default; the 4 new `lifecycle.feature` scenarios are purely additive (gherkin-cli addOnly:true, 4/0/0, self-clear, stay `@frozen`); the 3 new mux workspace scenarios are additive. No frozen scenario weakened without the CR's own authorization.
      blast: low — a scoped placement-default fix: `session.ts` resolves `--at` by spawn mode (new-worktree → `workspace`, `--cwd` → `tab`), `cli.ts` drops the hard `tab` default so the mode-keyed default owns it, and the tmux adapter maps `workspace` → `new-window` (visible window) not `new-session` (detached). Touches `session.ts` + `cli.ts` + `console/session.tmux.ts`; herdr adapter already correct; no registry/mail/worktree-lifecycle/CLI-contract bleed.
      novelty: low — the `--at` placement seam and both adapters already existed; this flips one default and remaps one tmux verb, reinforcing #158's `select-window` beam (a ship must land in a visible window, never a detached session the attached client can't see or beam to).
      confidence: high — two independent cold sdd-spec-judges: a fresh judge returned ALIGNED (oracle/builder/architect all PASS); a second judge caught one architect-lens spec/.feature drift (mux README still claimed the dropped no-placement fallback as a covered behavior) which was then reconciled; check-suite + check-spec-state green; the placement change is exercise-backstopped by session + adapter tests (the tmux `workspace` test fails against the pre-fix `new-session` mapping).
      judge: cold sdd-spec-judge ×2 — round-1 builder blockers (orphan lifecycle scenarios, phantom mux no-placement scenario) and the round-2 architect blocker (mux README/.feature drift) all cleared; ALIGNED.
      cr: github-161-spawn-visible-space
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
