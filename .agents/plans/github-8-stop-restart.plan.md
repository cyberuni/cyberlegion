---
cr-ref: github-8-stop-restart
project: cyberlegion
status: active
todos:
  - content: "explore: new unit/runtime node (stop, restart, rebind, show) + additive lifecycle/registry scenarios"
    status: completed
  - content: "spec gate: cold spec-judge, structural diff (expect addOnly on frozen suites), ledger gate line"
    status: completed
  - content: "deliver: MailboxStore seam + removeMailbox; stopped status; runtime module; CLI verbs; docs"
    status: completed
  - content: "impl gate: cold impl-judge over the frozen scenarios; pnpm verify green"
    status: completed
  - content: "handoff: PR against main (Closes #8), changeset, mail operator"
    status: completed
---

# github-8 — separate runtime stop/restart from destructive decommission

CR source: cyberuni/cyberlegion issue #8 (parent cyberuni/cyber-truss#5).

**Problem.** `unit close` is the only way to end a runtime, and it also removes the worktree,
record, and brief. A controller cannot replace a runtime without losing the work it represents.

**Shape.**

- `unit stop <ref>` tears down the session pane only, verified; the record becomes `stopped`
  (pane-less, prune-exempt), keeping id, handle, inbox, brief, and worktree.
- `unit restart <ref>` stops a live unit if needed, then opens a fresh session at the unit's cwd
  with its recorded launch, rebinds the record to the new pane, and rebriefs it. An interrupted
  restart leaves the unit `stopped`; a rerun recovers it.
- `unit rebind <ref>` binds a stopped unit to the calling pane (a session started by hand).
- `unit show <ref>` is the read-only runtime view: locator, probed liveness
  (live | gone | unknown | stopped | exited), and the controls the record and backend support.
- `unit close` also deletes the unit's mailbox, through a mail-side call.

**Boundary.** Mail retention on stop follows from the mailbox being keyed by unit id, not by
runtime: stop changes nothing mail-side. Mailbox deletion lives behind a `MailboxStore` seam split
out of `Store`. Sibling pod `cl-7-inbox-isolation` (#7) was told about the seam.

## NEXT

Landed as a PR against main (Closes #8): spec gate (round 3) and impl gate (round 1) self-asserted,
provisional pending the owner's ratification at the PR. Four backlog follow-ups are recorded in the
CR's ledger shard. No resume action remains.
