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

**The ownership chain:** keyed on relationship, not on transport alone. A turn from the receiver's
**own owner** in its **own session** is a decision only when it **answers the receiver's own
outstanding decision request**; its scope is the action, target and revision that request named,
narrowed by the words, and nothing adjacent. Words answering no request are the owner's order, never a
decision. A relayer sends the user-channel holder's words as said — no envelope, no next steps — and
records where they were said, the relaying unit and the scope on the work item's mail thread, as
audit. Answering a request is checkable in the moment, so it gates adoption; it is not a verification
of truth. Spent once acted on, attenuating at every hop. Not forgery-proof: `unit nudge --message`
records no caller identity, so position is a structural fact, not a proof.

This is cyberlegion's home for that rule (cyberfleet's `authority-governance` restates it for its own personas). `subagent-backend-governance` references it for the
owner's mid-turn channel rather than restating it.

The frameless→owner branch composes the `cyberlegion` CLI's standing owner identity (`identity
owner`), owner mail (`mail send` / `mail --owner`), and owner-mail surfacing (the `surfacing` hook).
Read is a deliberate `mail ack --owner`; surfacing shows a message but is never a read receipt.
