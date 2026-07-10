# ADR-0024: cyberlegion spec nodes align to the command tree and the mux/legion layer split

## Status

Proposed

## Context

The `cyberlegion` project-spec grew eight capability folders — `identity`, `session`, `mail`,
`wake`, `dispatch`, `agent`, `surfacing`, `init` — across several missions. Two of them
(`surfacing`, `wake`) name **no CLI command**: `surfacing` documents `mail hook` + `admin install`,
`wake` documents `mail await` + `mail watch` + `admin doctor`. They are **concepts elevated to
folders**, which the spec-structure doctrine (`.agents/specs/sdd/design/spec-structure.md`) already
forbids — a cross-cutting concern is carried as a `concept:` tag and a by-concept index, "healing
scatter by indexing, not moving." So the tree privileges two axes at once (capability folders *and*
concept folders), and the result is real friction: `identity who` and `session list` are the same
list under two names; `admin`'s verbs scatter across `surfacing`, `wake`, and a homeless remainder;
and `identity/` is oversized (43 > 40) because it carries both a session's self-identity *and* the
human owner's standing presence.

The earlier remedy (`cyberlegion-identity-presence-split`) proposed carving a `presence/` node out of
`identity/` — treating the symptom (one oversized node) without addressing the cause (the tree is on
the wrong axis). A decision is needed on **what a cyberlegion spec node should track**, because that
choice determines the whole realignment, a real CLI rename, and where `dispatch` lives.

## Decision Drivers

- **The CLI is the capability decomposition.** For a CLI, "capability" (the screaming-architecture
  folder axis) *is* the command group — the surface an agent actually types, arranged for AXI
  friction. A second taxonomy on top is pure overhead: hand-maintained cross-references that rot and
  lookups that surprise.
- **Concepts are tags, not folders** — the standing spec-structure doctrine. `surfacing`/`wake` are
  the violation, not a precedent.
- **The pure-mechanism charter.** The root spec fixes the CLI as pure mechanism: it "never selects a
  backend." Any node whose subject is *routing* (warm vs cold vs inline) does not belong to the CLI
  spec — it belongs to the Legate (ADR-0023).
- **A real architectural layer is not a concept.** The multiplexer (the `console/` code — a pane
  abstraction over tmux/herdr, unit-agnostic) is a genuine dependency boundary the legion is built
  on, not a cross-cutting tag.

## Considered Options

### Option 1: Carve `presence/` out of `identity/` (the superseded plan)

- **Pros**: smallest change; resolves the oversized flag; every moved scenario is verbatim
  (freeze-preserving).
- **Cons**: treats the symptom. Leaves `surfacing`/`wake` as concept-folders, the `who`/`list`
  duplication, and the `identity`-is-really-the-registry misname. Adds a *third* node on the same
  wrong axis.

### Option 2: Align nodes to the command tree + one node per real architectural layer

- **Pros**: one node per command group, concepts demoted to `concept:` tags. `surfacing`/`wake`
  dissolve into `mail`/`mux`; `identity`→`unit` (the registry it always was); `who`/`list` merge;
  `owner`→`register --standing`, `bind-main`/`main`→`attach`. The multiplexer becomes an explicit
  `mux` node (a dependency boundary, per DIP). `dispatch` (routing) leaves the CLI for the Legate,
  and the result-slot is dropped (dominated by the harness Task result and by mail).
- **Cons**: large — a spec realignment, a real CLI rename, a plugin move, and a `Store.result`
  deletion. Sequenced across several CRs.

### Option 3: Split the CLI package into `mux` and `legion`

- **Pros**: makes the layer boundary a package boundary.
- **Cons**: the legion needs the mux in-process for pane read/write; two packages buy little over a
  one-way in-repo dependency. Rejected — keep one package, enforce the seam internally.

## Decision

Adopt **Option 2**. cyberlegion spec nodes track **command groups**, plus **one node for each genuine
architectural layer**. The node set becomes:

`mux · unit · mail · agent · attach · init · admin`

- **`mux`** — the unit-agnostic pane abstraction (the `console/` layer); the legion depends on it
  one-way (DIP; ADR-0021).
- **`unit`** — the instance registry + lifecycle (was `identity` + the unit half of `session`);
  `owner` folds into `register --standing`.
- **`mail`** — the store and the universal return channel; absorbs former `wake` (`await`/`watch`)
  and `surfacing` (`hook`).
- **`agent`** — reusable definitions (the class to a unit's instance).
- **`attach`** — the human's read-pane (was `bind-main`/`main`); an attention pointer.
- **`init` · `admin`** — onboarding; hub-state maintenance.

`surfacing` and `wake` are demoted from folders to `concept:` tags on the nodes whose verbs they
touch. `dispatch` (routing over warm/cold/inline) stays with the **Legate**, per ADR-0023; the CLI
keeps **no** dispatch verbs and the `Store.result` slot is deleted (the harness Task result serves
the cheap cold path, mail serves the uniform one).

## Rationale

The command tree already *is* the capability decomposition an agent navigates; drawing spec nodes on
any other axis manufactures the exact scatter the concept doctrine exists to prevent. This choice is
therefore an **application** of the spec-structure doctrine (concepts are tags), not a reversal — the
only addition is the positive criterion that a real dependency boundary (`mux`) earns a node even
when it is not a command noun. Holding the CLI to its pure-mechanism charter forces `dispatch` out to
the Legate, which ADR-0023 already established as the routing seam; and once routing leaves, the
result-slot has no unique job (dominated on cost by the harness Task result and on uniformity by
mail), so it is dropped rather than kept as a third return channel.

## Consequences

### Positive

- One axis: command groups + real layers. Concepts are tags with a generated index.
- The `who`/`list` duplication, the scattered `admin`, and the `identity` misname all resolve; the
  oversized `identity/` node falls below threshold without inventing a `presence/` node.
- The CLI/plugin boundary matches the charter: mechanism in the CLI, routing in the Legate.
- A smaller `Store` (no `result` domain) and one return channel (mail + harness Task result).

### Negative

- A breaking CLI rename (`identity`→`unit`, `session` folded, `owner`→`register --standing`,
  `bind-main`→`attach`, `doctor`/`mode`→`mux`). Aliases soften the hot path but the surface changes.
- Large, multi-CR execution touching spec, CLI source, ~200 tests, the plugin, and docs.

### Risks

- Scenario movement must stay verbatim to be freeze-preserving; any rewrite re-opens a frozen
  `.feature`.
- The `dispatch` move must not fold fleet/persona concerns into the CLI or invert the dependency
  direction (cyberlegion never depends up on cyberfleet/SDD).

## Implementation Notes

Sequence (each its own CR): **(1)** this ADR; **(2)** spec-tree realignment on
`packages/cyberlegion/.agents/spec` (rename/dissolve nodes, add `mux`/`attach`, `concept:` tags),
freeze-preserving where scenarios move verbatim; **(3)** the CLI rename sweep (identity→unit, session
fold, owner/bind-main/doctor/mode moves), keeping hot-path aliases (`who`/`send`/`inbox`/`spawn`) and
bare-status; **(4)** move `dispatch` to the plugin and delete `Store.result`. Deferred, recorded but
out of scope: `attach --follow` (tmux focus-events) and `mail read`/`await --verdict-schema`.

## Related Decisions

- [ADR-0023](0023-dispatch-seam.md) — the `subagent | channel | run-inline` routing seam this keeps in
  the Legate; cyberlegion carries no dispatch routing verb.
- [ADR-0021](0021-spec-dependency-kinds.md) — depend by intent, not internals; the legion→mux
  dependency and the SDD→dispatch dependency both follow it.
- `.agents/specs/sdd/design/spec-structure.md` — the concept-axis doctrine (concepts are tags, not
  folders) this decision applies.
