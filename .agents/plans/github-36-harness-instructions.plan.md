---
cr-ref: github-36-harness-instructions
project: cyberlegion
status: active
todos:
  - content: "explore: agent/ node — additive per-harness instruction-channel scenarios + README prose"
    status: completed
  - content: "needs-input: cursor has no instruction channel — owner decided: prepend to the brief"
    status: completed
  - content: "spec gate: cold spec-judge, structural diff (expect addOnly), ledger gate line"
    status: completed
  - content: "deliver: test-first codex developer_instructions + cursor refusal in realizeLaunch"
    status: completed
  - content: "impl gate: cold impl-judge over the new frozen scenarios"
    status: completed
  - content: "rework: cursor instructions in front of the brief; agent map rows after #50/#55"
    status: completed
  - content: "handoff: PR #51 against main (Closes #36), CI green, mail operator ready"
    status: in_progress
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

**Cursor: prepend to the brief** (owner's decision, overriding the refuse recommendation). The
realized launch returns `briefInstructions`; spawn writes them under `## Agent instructions` ahead of
the task under `## Brief`. Under `--no-wake` they arrive only when the brief is read (documented).

## NEXT

Both gates re-run and self-asserted by:agent after the rework (spec round 3 ALIGNED; impl round 2
10/10, bridge-bound). Rebased onto main past #50/#55. Remaining: CI green on PR #51, then mail the
operator "ready"; merge is the operator's call. Separate follow-on: cursor effort with no model
(its own issue + PR), blocked on a cursor-agent login for the live check.
