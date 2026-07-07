# relay-governance

Internal cyberlegion governance. The Legion's **report/ask contract**: how a headless agent (no live
user channel) returns a result or surfaces a question it cannot answer, keyed on its own lifecycle.

- **Subagent** (Task-spawned, a caller frame awaits) → return `needsInput` in the `DispatchResult`.
- **Spawned peer / channel** (spawner awaits) → return the packet or reply on the mail thread.
- **Bare top-level / cron** (no frame) → push `mail send` to the standing owner and exit; a later
  tick or the owner's reply resumes, state carried on the thread.

Loaded by `dispatch-governance` (to relay a callee's `needsInput`) and by any headless agent
(`headless-legate`, `sdd-automaton`, cold judges). Not user-invocable — see `SKILL.md`.

The frameless→owner branch composes the `cyberlegion` CLI's standing owner identity (`identity
owner`), owner mail (`mail send` / `mail --owner`), and owner-mail surfacing (the `surfacing` hook).
Read is a deliberate `mail ack --owner`; surfacing shows a message but is never a read receipt.
