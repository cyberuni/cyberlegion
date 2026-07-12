---
spec-type: behavioral
concept: [session, conformance]
---

# session-adapter — the `session-adapter-governance` conformance contract

The ratified design rule for every `SessionAdapter` **mutating** operation (doctrine entry 2,
`packages/cyberlegion/.agents/spec/ledger/strategy.a3da48.jsonl` seq 2, ratified by CR #162): an
operation that drives the multiplexer to change session state must **verify its observable effect
landed, or fail loud** — it never reports success on a fire-and-forget send. The
`session-adapter-governance` partial skill carries the rule, the effect-class distinction that
keeps it from being a mechanical copy across ops, and the per-op conformance ledger downstream CRs
cite as their authority.

**Fit:** governance (reference-only, loaded by name). The activation layer carries no signal — the
skill is `user-invocable: false` and invoked by name from a CR brief or a producer touching adapter
operations. Signal is all in the criteria layer: does the loaded body encode each rule exactly, and
does an agent applying it classify a concrete op into the right effect class and verdict.

## Scope boundary — the rule, not the mechanics

This node specs the **governance contract**: what the rule states, the two effect classes, what a
conformant / non-conformant op looks like, and the conformance ledger. The adapter operations
themselves (`send`, `submit`, `focus`, `nudge`, `clearUnit`, `wakeRecipient`) are the sibling
`cyberlegion` CLI project (`packages/cyberlegion`) — their behavior suites live there (`unit/`,
`mail/surface`); this node never re-specs an op's own scenarios, only the rule they are audited
against.

## Use Cases

**Subject** — the verify-observable-effect-or-fail-loud rule as loadable governance: the mutating-op
definition, the unconditional vs attach-relative effect-class split (with the headless no-op
carve-out), the best-effort degradation contract, and the enumerated conformance status of every
current adapter mutating op.

**Non-goals** — implementing the outstanding conformance work (focus land-verify + no-attached-client
no-op, clear verify-after — follow-up CRs this governance authorizes); the dispatch routing brain
(`dispatch/`); the CLI operations' own behavior (sibling `packages/cyberlegion` spec); any
multiplexer-specific mechanics.

| Use case | Trigger | Inputs | Outcome |
|---|---|---|---|
| **author a new adapter mutating op** | a CR introduces or reshapes a `SessionAdapter` op or a composite over one | the op's design | the op declares its effect class and ships verify-or-fail-loud (or a recorded no-op carve-out) at its own CR |
| **audit an existing op** | a conformance CR (e.g. the authorized focus / clear follow-ups) | the op's source | a per-op verdict against the rule, citing this governance not a peer's say-so |
| **judge at a gate** | spec/impl gate on an adapter-touching CR | the diff | the gate checks the effect class was declared and the verification matches the class |
