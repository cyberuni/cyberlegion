# ADR-0025: SessionAdapter mutating ops verify their observable effect or fail loud

## Status

Accepted

## Context

The cr150 nudge boot-race exposed a failure mode generic to the whole `SessionAdapter` surface:
`unit nudge` ran one atomic text+Enter send and reported success regardless of whether the booting
harness actually consumed the Enter, so the spawned peer sat idle at $0.00 while the caller
believed it had started. PR #153 fixed nudge with submit-then-verify-then-retry (throw on the cap),
and the SDD doctrine loop's Scanner distilled the general rule as **unratified strategy entry 2**
(`packages/cyberlegion/.agents/spec/ledger/strategy.a3da48.jsonl`, seq 2): any adapter operation
that changes peer/session state must verify the observable effect took hold before reporting
success, and audit sibling ops against the rule rather than letting each rediscover the same
fire-and-forget failure.

The rule then needed authority. When #158 (focus cross-workspace beaming, PR #160) was asked on a
peer relay to adopt the verify-after for focus, it deliberately **escalated instead of adopting** —
a design rule taken from a peer's say-so has no provenance, and a mechanical copy of nudge's
read-back onto focus would have **false-failed every headless spawn**: focus's effect (the attached
client's view moves) only exists when a client is attached. That escalation is this CR
(cyberuni/cyberplace#162): ratify entry 2 and codify it where every current and future adapter op
loads it with clean provenance.

## Decision Drivers

- Rules must bind by **being loaded, not asserted** — downstream CRs (#158's focus land-verify,
  the clear audit, #159's doorbell vocabulary) need one citable authority.
- The rule is **not op-shape-portable as-is**: effects differ in *when they exist at all*, so a
  single mechanical verification recipe would be wrong for part of the surface.
- The doctrine loop's contract: ratified strategy re-enters the corpus as a CR; unratified strategy
  never silently becomes doctrine.

## Considered Options

### Option 1: Extend `subagent-backend-governance`

- **Pros**: no new skill; an existing cyberlegion governance to hang the rule on.
- **Cons**: wrong concern — that skill is the *cold-subagent dispatch procedure* (resolve def →
  Task tool → Task-result), which never touches a mux pane. Adapter conformance criteria would be
  invisible to the people who need them and noise to that skill's actual loaders.

### Option 2: Adapter's own spec prose only (no loadable governance)

- **Pros**: zero skill surface; the rule lives beside the interface it governs.
- **Cons**: specs are not portable operating instructions — producers and CR briefs load skills and
  governances at runtime, not spec bodies. The rule would again travel by say-so.

### Option 3: New `session-adapter-governance` partial skill (chosen)

- **Pros**: one loadable authority with clean provenance; the effect-class distinction and the
  per-op conformance ledger live where every adapter-touching CR resolves them; matches the
  existing cyberlegion governance pattern (`dispatch-governance`, `relay-governance`).
- **Cons**: one more skill to maintain; the ledger snapshot needs updating as follow-ups land.

## Decision

Ratify doctrine entry 2 and codify it as the **`session-adapter-governance`** partial skill
(`plugins/cyberlegion/skills/session-adapter-governance/`), specced and frozen at
`.agents/specs/cyberlegion-plugin/session-adapter/session-adapter-governance.feature`. The entry's
`ratified` flag flips to `true` in the Scanner's shard as the mechanical record of this CR's
keep verdict (the Council decision is issue #162 itself).

**The rule.** A `SessionAdapter` mutating op (or a composite over one that reports success) must
verify its observable effect landed, or fail loud — never fire-and-forget success. Read-only ops
are out of scope; the duty sits on the composite, not the raw primitive.

**The attach-relative design rationale.** Effects come in two classes:

- **Unconditional** — observable regardless of who is watching (nudge: input consumed; clear:
  reset taken as a turn). Verify on every invocation.
- **Attach-relative** — the effect only exists when a client is attached (focus: a view move needs
  a viewer). Verify only when the precondition holds; **"no attached client" is a legitimate
  no-op, not a failure**. A naive unconditional read-back false-fails every headless/unattended
  spawn — the exact risk PR #160 cited when it deferred focus's land-verify to this CR. This is
  why ratification was not a mechanical copy of the nudge pattern across ops.

Verify-*before* (resolve-or-throw) is necessary but not sufficient for an unconditional effect;
best-effort decorations (the delivery doorbell) still verify, surfacing failure as an explicit
warning rather than a throw, and never fail the durable operation they decorate.

**Conformance at ratification** (the ledger, in full in the skill): `nudge` conformant (the
reference pattern, #150/PR #153); `focus` partial — verify-before shipped (PR #160), land-verify +
no-attached-client no-op **authorized follow-up**; `clear` non-conformant on verify-after — its
injection is a raw `adapter.send`, fix (route through the nudge verify path) **authorized
follow-up**; mail-delivery doorbell conformant under the best-effort contract (#159/PR #165).

## Consequences

- Downstream CRs implement per-op verification citing this governance, not a peer relay.
- A CR introducing or reshaping a mutating op declares its effect class and ships class-matched
  verification in the same CR, or records an authorized follow-up in the ledger.
- The ledger snapshot in the skill is a living table — follow-up CRs update their row as they land
  (an additive/reconcile touch to the frozen suite's enumeration scenario when statuses change).
