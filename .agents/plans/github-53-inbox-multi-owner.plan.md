---
cr-ref: github-53-inbox-multi-owner
project: cyberlegion-plugin
status: active
todos:
  - content: "explore: redraw inbox/ CFG to skill-owned edges; MANY -> fail loud; author inbox.feature; bind the map"
    status: completed
  - content: "spec gate: check:suite + cold ACED spec-judge; freeze inbox.feature; ledger gate line"
    status: completed
  - content: "deliver: red run of the impl-judge on the current skill, then fix manage-inbox SKILL.md + docs page"
    status: in_progress
  - content: "impl gate: cold ACED impl-judge over the frozen suite"
    status: pending
  - content: "handoff: PR against main (Closes #53), CI green, mail operator"
    status: pending
---

# github-53 — manage-inbox has no rule for several standing owners

CR source: cyberuni/cyberlegion issue #53. Relayed by operator on the maintainer's "fix".

**Rule.** `CYBERLEGION_OWNER` unset and more than one standing owner → fail loud: pick none, list
every standing handle, name the fix (`CYBERLEGION_OWNER=<handle>`), run no owner-scoped mail command.

**Where it lives.** The CLI never reads `CYBERLEGION_OWNER`; owner resolution is skill-only
(`manage-inbox`, and `relay-governance` for frameless reports — the latter out of scope, reported).

**Scope decision.** The rule is the first scenario of a new `inbox/inbox.feature`. The spec gate
freezes only a suite that covers the node and `check-suite` binds the map 1:1, so the whole
suite is authored here — skill-owned decisions only; CLI outcomes stay in the CLI's `mail/core`.

## NEXT

Deliver: red run of the cold ACED impl-judge on the current SKILL.md, then add the several-owners
stop (and any other failing scenario's rule) to `manage-inbox` and its docs page.
