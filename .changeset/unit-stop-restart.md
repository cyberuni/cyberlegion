---
'cyberlegion': minor
---

You can now end or replace a unit's session without destroying the unit. `unit close` is still the only command that removes a unit.

- `unit stop <ref>` tears down the unit's pane, confirms the backend no longer lists it, and marks the unit `stopped`. The unit keeps its id, handle, inbox, brief, and worktree. A stopped unit is never pruned and stays addressable by handle, so mail sent to it while it has no session still lands in its inbox.
- `unit restart <ref> [--no-wake]` opens a fresh session at the unit's cwd with the launch command it was spawned with, and rings the session to read its brief. If a session is still running, restart stops it first. If the new session fails to open, the unit is left stopped, and running restart again recovers it.
- `unit rebind <ref>`, run inside a pane where you started the harness by hand, makes that session the unit.
- `unit show <ref>` reports where a unit's runtime is, whether the backend lists it right now (`live`, `gone`, `unknown`, `stopped`, `exited`), and which controls work on it. It writes nothing.

`unit close` now also deletes the unit's mailbox. Before this change, the mailbox was left behind on disk. `unit spawn` now records its launch command on the unit's record so that `restart` can reuse it.
