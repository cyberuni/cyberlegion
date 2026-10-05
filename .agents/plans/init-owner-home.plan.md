---
cr-ref: init-owner-home
project: cyberlegion-plugin
status: active
todos:
  - content: "explore: init node — offer a home at mint, add/drop a home on an existing owner, explain the presence"
    status: completed
  - content: "spec gate: cold ACED spec-judge, structural diff (expect addOnly on the frozen suite), ledger gate line"
    status: completed
  - content: "deliver: SKILL.md + README.md for the home offer; pins.json check, changeset coverage for #155"
    status: in_progress
  - content: "impl gate: cold ACED impl-judge over the frozen scenarios; pnpm verify green"
    status: pending
  - content: "handoff: PR against main (never merged), report to op-cyberlegion"
    status: pending
---

# init-owner-home — init-cyberlegion offers the standing owner a home

CR source: a dispatch brief (no forge issue). No closing reference.

**Problem.** `unit register --standing --home` (#155) lets a standing owner's presence be spawned
on demand, but `init-cyberlegion` mints the `legate` owner bare and never mentions a home, and it
stops outright when an owner already exists.

**Shape.**

- At mint (still on the bind yes): explain the presence, then ask for a home folder. A folder →
  `--home <dir>` plus `--harness <probe harness>` or `--agent <def>`; no folder → bare, as today.
- An owner already minted: never re-ask the bind; offer to add a home, or to drop one with
  `--clear-home`. Re-registering keeps the record's id and its presence — not a re-mint.
- Explain: `unit claim legate` binds a live session as the presence until another claim or until
  that session exits; the home is the fallback when nobody holds it, and it outranks the main pane.
- `pins.json` is at 1.3.0, which predates #155. No unreleased pin; the `standing-home-spawn`
  changeset carries #155 into the next release, and the version sync bumps the pin.

## NEXT

Deliver: land the SKILL.md + README.md home offer against the frozen init suite, then the impl gate.
