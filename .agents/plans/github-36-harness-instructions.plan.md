---
cr-ref: github-36-harness-instructions
project: cyberlegion
status: active
todos:
  - content: "explore: agent/ node — additive per-harness instruction-channel scenarios + README prose"
    status: completed
  - content: "needs-input: cursor has no instruction channel — recommended refuse loudly (mailed operator)"
    status: in_progress
  - content: "spec gate: cold spec-judge, structural diff (expect addOnly), ledger gate line"
    status: completed
  - content: "deliver: test-first codex developer_instructions + cursor refusal in realizeLaunch"
    status: completed
  - content: "impl gate: cold impl-judge over the new frozen scenarios"
    status: completed
  - content: "handoff: PR against main (Closes #36), rebase after #41 if it lands first, mail operator"
    status: pending
---

# github-36 — realizeLaunch sends claude's instructions flag to codex and cursor

CR source: cyberuni/cyberlegion issue #36. Overlaps #41 (open) on one line in `realizeLaunch`.

**Defect.** `realizeLaunch` emits `--append-system-prompt '<body>'` for every harness; only claude
accepts it.

**Per-harness channel** (verified from each installed CLI, not guessed):

- claude 2.1.278 — `--append-system-prompt <body>`. Unchanged.
- codex 0.153.4 — no flag; top-level config key `developer_instructions`, set with
  `-c developer_instructions=<TOML basic string>`. Verified live: a `codex exec` run with the override
  followed it. Appends to codex's base instructions (the analogue of append, not replace).
- cursor-agent 2026.07.01 — `--help` lists no system-prompt, instructions, or rules flag and no
  config override. Only the positional prompt, workspace rule files, and the brief remain.

**Cursor: refuse** (recommended, mailed as needs-input). A rule file writes into the unit's tree
and persists; prepending to the brief demotes instructions to a user turn and is unread under
`--no-wake`. Refusal matches #34's cursor effort-without-model precedent.

## NEXT

Both gates self-asserted by:agent (cold spec-judge ALIGNED; cold impl-judge 7/7, mutation-backstopped).
Rebased onto main after #41 landed. Open: the owner's reply on the cursor refusal (needs-input
mailed); PR against main (Closes #36), then mail the operator.
