---
cr-ref: github-45-ledger-exclusion-rule
project: cyberlegion
status: active
todos:
  - content: "explore: ledger exclusion by position (.agents/specs/<project>/ledger/), not folder name; additive scenarios"
    status: completed
  - content: "spec gate: cold spec-judge; structural diff on metaphor-free.feature (expect addOnly); ledger gate line"
    status: completed
  - content: "deliver: rule-based exclusion in metaphor-free.ts; test-first, red under the old folder-name prefix"
    status: completed
  - content: "impl gate: cold impl-judge over frozen scenarios; pnpm verify"
    status: completed
  - content: "handoff: PR against main (Closes #45), report to operator, do not merge"
    status: completed
---

# github-45 — exclude every project spec's ledger by rule

CR source: cyberuni/cyberlegion issue #45 (a backlog follow-up of github-29).

The guard excludes `.agents/specs/cyberlegion-plugin/ledger/` by that one folder name. A second
project spec under `.agents/specs/` would have its ledger scanned. Replace the name with a
positional rule: the `ledger/` directly under any `.agents/specs/<project>/` is provenance. A
`ledger`-named folder deeper inside a project spec is not a ledger and stays scanned, so the rule
cannot widen into "any path segment named ledger".

Out of scope: the allow-list's outward-caller references (held, decided elsewhere).

## NEXT

Landed on the PR (Closes #45): the contract states the positional ledger rule with two additive
frozen scenarios, and the guard excludes `.agents/specs/<project>/ledger/` for every project. Both
gates self-asserted by agent; merging is a human call. Nothing left to resume.
