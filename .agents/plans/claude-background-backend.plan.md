---
cr-ref: claude-background-backend
project: cyberlegion
status: active
todos:
  - content: "intake: owner decisions — Clearance on the frozen no-mux refusal, fallback vs opt-in, Stop-hook scope"
    status: completed
  - content: "explore: ADR-0036 + spec/suite for the background backend (mux selection, registry locator, backend ops)"
    status: completed
  - content: "spec gate: cold spec-judge, structural diff of touched frozen suites, ledger gate line"
    status: completed
  - content: "deliver: background backend adapter, spawn selection by harness, locator kind, prune/who liveness"
    status: in_progress
  - content: "impl gate: cold impl-judge over the frozen scenarios; pnpm verify green; dist rebuilt"
    status: pending
  - content: "handoff: PR against main, changeset, follow-ups recorded"
    status: pending
---

# claude-background-backend — spawn Claude units outside a multiplexer

CR source: in-session request (no forge issue). No closing reference.

**Problem.** `unit spawn` refuses outside tmux/herdr. Claude Code runs its own background sessions
(`claude --bg`), which give a handle, liveness, a first turn, and a stop — enough to host a unit.

**Shape.** A detected multiplexer still wins. With none and `--harness claude`, the unit runs as a
Claude background session. Cursor/Codex still need a multiplexer. Ring an idle unit by stop +
resume-by-session-id with the ring text; verify by the session's state.

Related RFCs (out of scope): `docs/adr/0034-terminal-views-for-background-units.md`,
`docs/adr/0035-terminal-backends-through-cyber-mux.md`.

## NEXT

Deliver. Spec gate ratified by the owner (ledger seq 2); frozen: `mux`, `unit/background`,
`unit/registry`, `mail/doorbell`. Build against `unit/background/background.feature` plus the added
scenarios in the other three. Invalid state (active record, session listed `stopped`) is out of
contract. Follow-ups to record at handoff: `unit clear`/`unit restart` on a background unit; `blocked`
in `unit who`; issue 190 (busy ring).
