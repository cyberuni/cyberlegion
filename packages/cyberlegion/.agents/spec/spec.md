---
status: approved
project-path: packages/cyberlegion
approval:
  spec:
    verdict: approve
    by: unional
    cause: ceiling
    why:
      floor: clearance — GRANTED LIVE by the owner before drafting, and re-affirmed at this ratification. The CR narrows frozen scenarios in two nodes (`mail/surface` loses both brief-injection scenarios; `unit/lifecycle` rewrites the first-turn doorbell step and the pre-registration status) and supersedes ADR-0027, which split payload-delivery from turn-delivery deliberately. The owner was shown both consequences and selected the option naming them; the grant is recorded as seq 1 of this CR's ledger shard, ahead of any narrowing edit.
      blast: high — RAISED from medium at the second-pass gate. Still spec + suite only, and still confined to two nodes of one project spec (`mail/doorbell` was in the intake estimate and is NOT touched — no scenario there references the spawn doorbell; the node is `mail send` delivery-ring scoped). What changed is depth, not reach: a cold re-derivation found 40 coverage holes and ~11 vacuous scenarios in suites whose retrofitted maps both reported 1:1, and the owner elected to close all of them here. `mail/surface` went 24 → 35 scenarios and `unit/lifecycle` 60 → 87, so this gate re-judges two nodes end to end rather than a two-node delta. The implementation this contract admits is larger again and is what the impl gate judges.
      novelty: low — the mechanism already exists (`MuxAdapter.submit`/`nudge`, surfaced as `unit nudge --message`). This is a re-spec of what the wake says plus the retirement of a now-dead pickup path, not new plumbing. The one genuinely new contract surface is read tolerance for a legacy `spawning` record migrated from an older hub.
      confidence: high — six cold spec-judge rounds at this second-pass gate, on top of three at the first. The class that cost five of the six rounds was a single migrating defect: an absence assertion that could not fail. R1 and R2 found refusals asserting the throw but not the absence of what the guard prevents, each fixed at the sites named and each recurring at new ones. R3 replaced the reading pass with a mechanical sweep, which closed every absent absence and introduced inert ones — its predicate was syntactic, and existence is not loseability. R3 named the invariant that closed it: every absence Then must be loseable on its own Given, which means naming the wrong implementation and the concrete artifact it produces. R4 applied it to all 104 absence assertions and closed 10, missing one because it used the corollary (bind the noun) as the whole rule. R5 caught the last one, an absence wearing positive syntax that five keyword-keyed sweeps had walked past. R6 swept a third axis (state-preservation vocabulary, 13 sites no negation sweep reaches) plus the residual set carrying no marker at all, and found no further hiding place. Findings by round: 4, 4, 4, 1, 1, 0, against a suite that grew 84 to 122.
      judge: cold sdd-spec-judge round 6 of the second pass — oracle/builder/architect all PASS; ALIGNED true; SCENARIOS_FAILING []; no blocker, no open questions. 35/35 scenarios in `mail/surface` and 87/87 in `unit/lifecycle`, with map rows 1:1 against both suites in both directions. The seven-refusal family was re-derived from the CFG rather than read off the README claim, and the two declared-inert columns were confirmed to be exactly the pair the README names. All six deterministic checks green.
      hitl: two owner decisions taken live in-session. (1) Drop `spawning` and register spawn as `active`, rather than keeping a hook alive for bookkeeping or hanging the flip off the best-effort wake — the latter would contradict the still-frozen ring-never-fails-spawn scenarios. (2) The R2/F1 remedy: freeze the retirement with a legacy-`spawning` scenario, rather than conceding it unobservable and unfreezing the claim that pickup no longer depends on a hook firing. The ratification is positional and in-session; the landing stays the owner's at the PR.
      cr: spawn-wake-carries-brief
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
| [`metaphor-free/`](./metaphor-free/README.md) | the vocabulary-boundary guard — a mechanical check that fails when a banned fleet-persona term appears unsanctioned in the package (enforces the metaphor-free charter above) |

> CR-2 (`cyberlegion-cli-realign`, ADR-0024) realigned this tree to command groups + one node per
> real architectural layer (`mux`); `identity`/`session` dissolved into `unit`, `surfacing`/`wake`
> dissolved into `mail`/`mux`/`init`, `attach`/`admin` are new. **CR-4 dissolved `dispatch/`
> entirely**: the result-slot (`prep`/`collect`/`Store.result`) is dropped — a caller composes
> `unit spawn` + `mail await` (channel) or a cold Task subagent that returns via Task-result — and the
> routing brain (warm-peer vs subagent vs run-inline) lives in the Legate plugin, not the CLI. See
> `.agents/plans/cyberlegion-cli-realign.migration-map.md` for the full scenario→target contract.

<!-- BEGIN generated: by-concept (project-spec/concept-index) -->

## By concept

> Generated from `concept:` frontmatter by `project-spec/concept-index` — do not edit by hand.

| Concept | Facets |
|---|---|
| `cyberlegion` | `admin/` (behavior) · `agent/` (behavior) · `attach/` (behavior) · `init/` (behavior) · `mail/` (index) · `mail/core/` (behavior) · `mail/doorbell/` (behavior) · `mail/surface/` (behavior) · `mail/wait/` (behavior) · `metaphor-free/` (behavior) · `mux/` (behavior) · `unit/lifecycle/` (behavior) · `unit/registry/` (behavior) |

<!-- END generated: by-concept -->
