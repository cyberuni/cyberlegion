---
cr-ref: github-56-unknown-harness
project: cyberlegion
status: active
todos:
  - content: "explore: agent/ node — additive unknown-harness scenarios, CFG edges, map rows, Use Cases prose"
    status: completed
  - content: "spec gate: cold spec-judge, structural diff (expect addOnly), ledger gate line"
    status: completed
  - content: "deliver: test-first harness validation in resolve.ts; pnpm verify green"
    status: completed
  - content: "impl gate: cold impl-judge over the two new frozen scenarios"
    status: completed
  - content: "handoff: PR against main (Closes #56), mail operator"
    status: completed
---

# github-56 — an unknown harness tag reaches the launch command

CR source: cyberuni/cyberlegion issue #56.

**Defect.** `toAgentDef` casts the `harness` tag unchecked, so a typo (`harness: claud`) resolves and
`realizeLaunch` builds a command starting with `undefined`.

**Fix.** Validate at resolve time against the launch map's keys (the one home for the valid set),
throwing with the value and the valid set. `agent list` shares the parser, so one bad def fails the
whole listing loudly rather than being dropped silently.

Coordination: another unit is editing `realize.ts`; this CR stays in `resolve.ts`.

## NEXT

Landed as a PR against main (Closes #56): both gates self-asserted, provisional pending the owner's
ratification at the PR. No resume action remains.
