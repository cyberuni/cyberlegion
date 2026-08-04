---
status: implemented
project-path: packages/cyberlegion
approval:
  impl:
    verdict: approve
    by: agent
    cause: dimension
    why:
      floor: none — no frozen scenario narrowed during deliver; the spec tree is byte-identical to the spec-gate commit (the code moved to the contract, never the reverse). The Clearance the spec gate carried was granted before drafting and is unchanged.
      blast: medium — a forked seam deleted (7 modules, 77 tests), a published dependency added pinned exact, ~14 import sites retargeted, and a user-visible env-namespace migration. Contained by the transitional read: a pane spawned before this lands keeps its identity rather than silently losing it.
      novelty: low — the mechanism is the package's and was already proven upstream; what is new here is three small seams encoding this project's own policy (the transitional env read, the unstorable-backend refusal, and naming the pane a split splits from).
      confidence: high — three cold impl-judge rounds, each finding a real gap the previous had missed. R1: two scenarios with no verification at all, because the end-to-end harness strips the very environment they need. R2: eight MORE, proven by stubbing the installed dependency and watching all 378 tests still pass — the fork's deleted tests had been waved through as "covered upstream", which protects the package's behavior and not this project's contract. R3: all 26 mutation-killed individually, dependency restored byte-for-byte and checksum-verified against the published tarball.
      judge: cold sdd-impl-judge round 3 — IMPLEMENTATION_PASS true; 26/26 frozen scenarios mutation-proven; no absorption findings; no structural blocker.
      hitl: the namespace decision was the owner's, taken live before any drafting. Verified beyond the suite against a live multiplexer — a real spawn opened a real pane and worktree, mail delivered, and prune discriminated (reaping nothing while the pane lived, the record once it died). The landing stays the owner's at the PR.
      cr: github-339-cyberlegion-on-cyber-mux
  spec:
    verdict: approve
    by: agent
    cause: dimension
    why:
      floor: clearance — GRANTED LIVE by the owner before drafting. The namespace migration rewrites frozen scenarios on `mux/mux.feature` (gherkin-cli structural diff: 7 added / 3 modified / 3 removed; all 3 removed are retitles whose replacements are among the added, independently re-verified by the cold judge in rounds 2 and 4 — no behavior dropped). The owner selected the option whose statement named the frozen-scenario rewrite and the Clearance floor; that selection is the pre-authorization. Alternatives (keep the old namespace behind the package's `envPrefix` seam; block on a further upstream change) were presented and declined.
      blast: medium — spec + suite only at this gate. One node rewritten (`mux/`, +3 required sections it never carried) and three prose lines retargeted on `unit/registry/` so the corpus does not document two different current namespaces. The implementation this contract admits is larger (a forked seam deleted, ~14 import sites retargeted), which is what the impl gate judges.
      novelty: low — the contract barely moves. Detection, placement and focus reporting keep their existing scenarios; what changed is which env names carry the fast-path, plus two guards that fall out of consuming a package that detects more backends than this project can store.
      confidence: high — four cold spec-judge rounds. R1 short-circuited on a governance pre-flight miss (producer had declared 1 of 7 bars). R2 ALIGNED false on two real defects: a pairwise-consistency contradiction (adding a precedence tier without excluding it in the lower-tier siblings' Givens) and knowledge duplication restating a sibling node's storable-set fact. R3 verified both fixed but failed architect on section order introduced by R2's own remediation. R4 ALIGNED true, re-deriving R2's fixes independently rather than deferring to R3.
      judge: cold sdd-spec-judge round 4 — oracle/builder/architect all PASS; ALIGNED true; 26/26 scenarios clean; metaphor grep clean.
      hitl: the load-bearing decision (migrate the namespace rather than adopt the compat seam) was ratified live by the owner before drafting, as was the choice not to file a new issue (#339 already covers this exactly). The landing stays the owner's at the PR.
      cr: github-339-cyberlegion-on-cyber-mux
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
