---
cr-ref: github-58-agent-prose-fixes
project: cyberlegion
status: active
todos:
  - content: "explore: agent/ prose — #57 undefined not false, #58 --file, #59 drop dead citation"
    status: completed
  - content: "re-open: record the Clearance grant, rewrite the frozen scenario's When step"
    status: completed
  - content: "spec gate: cold spec-judge, re-freeze, ledger gate line"
    status: completed
  - content: "impl gate: cold impl-judge over the rewritten scenario (no code change)"
    status: completed
  - content: "handoff: PR against main (Closes #57, #58, #59), mail operator"
    status: completed
---

# github-58 — agent node prose corrections

CR sources: cyberuni/cyberlegion issues #57, #58, #59. One PR, as the owner directed; all three are
prose corrections in the agent node.

- #57 — an omitted warm/interactive resolves to `undefined`, not `false`.
- #58 — `agent resolve`'s exact-file flag is `--file`; `unit spawn`'s is `--agent-file`. The frozen
  scenario's When step is rewritten to the real flag, through the re-open path (Clearance
  pre-authorized in the CR, outcome unchanged).
- #59 — the cited `article-writer.md` does not exist; the citation is removed.

Observation, not acted on: two API-level scenario titles still use the `--agent-file` mnemonic.

## NEXT

Landed as a PR against main. Both gates self-asserted, provisional pending the owner's
ratification of the Clearance at the PR. No resume action remains.
