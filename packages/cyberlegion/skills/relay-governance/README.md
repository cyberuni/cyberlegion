# relay-governance

Internal cyberlegion governance. The Legion's **report/ask contract**: how a headless agent (no live
user channel) returns a result or surfaces a question it cannot answer, keyed on its own lifecycle —
plus the **receive side**: how an agent triages a relayed steer by authority level.

- **Subagent** (Task-spawned, a caller frame awaits) → return `needsInput` in the `DispatchResult`.
- **Spawned peer / channel** (spawner awaits) → return the packet or reply on the mail thread.
- **Bare top-level / cron** (no frame) → push `mail send` to the standing owner and exit; a later
  tick or the owner's reply resumes, state carried on the thread.

Loaded by `dispatch-governance` (to relay a callee's `needsInput`) and by any headless agent
(`headless-legate`, `sdd-automaton`, cold judges). Not user-invocable — see `SKILL.md`.

**Receiving a steer:** decompose by authority level, never bundle-adopt or bundle-reject. An
in-scope refinement (testable against the receiver's own frozen spec / CR acceptance / leash) adopts
in-band, no provenance needed; cross-cutting / out-of-leash doctrine escalates up the relay for
ratification. Provenance over peer mail cannot be established, so a receiver acts only on what it
can verify against its own loaded contract — a ratification it fetched from a peer is invalid.

**The ownership chain:** keyed on relationship, not on transport alone. A decision relayed by the
receiver's **own owner** **and** arriving on a **turn** in its own session — carrying the Council's
verbatim words, where they were said, the relaying unit, and its scope (one action on one target) —
is adoptable within that named scope and nothing adjacent, spent once acted on, attenuating at every
hop. Either half alone leaves it a peer steer. The four parts are a **well-formedness** requirement:
presence is checkable on its face, so a missing part gates adoption, and truth is not, so the parts
buy **audit** after the fact, never verification in the moment. Not forgery-proof: `unit nudge
--message` records no caller identity, so position is a structural fact, not a proof.

This is the **single home** of that rule. `subagent-backend-governance` references it for the
owner's mid-turn channel rather than restating it, and the revision part of the scope is a named
**open cross-repo seam** — a sibling corpus states a three-part scope; this one states two.

The frameless→owner branch composes the `cyberlegion` CLI's standing owner identity (`identity
owner`), owner mail (`mail send` / `mail --owner`), and owner-mail surfacing (the `surfacing` hook).
Read is a deliberate `mail ack --owner`; surfacing shows a message but is never a read receipt.
