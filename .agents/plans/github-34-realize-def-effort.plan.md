---
cr-ref: github-34-realize-def-effort
project: cyberlegion
status: active
todos:
  - content: "explore: agent/ node — additive realizeLaunch effort scenarios + README use-case prose"
    status: completed
  - content: "spec gate: cold spec-judge, structural diff (expect addOnly), ledger gate line"
    status: completed
  - content: "deliver: test-first per-harness effort mapping in realizeLaunch; pnpm verify green"
    status: completed
  - content: "impl gate: cold impl-judge over the new frozen scenarios"
    status: completed
  - content: "handoff: PR against main (Closes #34), mail operator, then start #33 on top"
    status: completed
---

# github-34 — realizeLaunch drops a def's effort

CR source: cyberuni/cyberlegion issue #34. Blocks #33 (`unit spawn --model/--effort`).

**Defect.** `resolveAgentDef` parses `effort`; `realizeLaunch` never emits it, so a def's effort is
silently dropped at launch.

**Per-harness mapping** (verified from each installed CLI's `--help`):

- claude — `--effort <level>` (low, medium, high, xhigh, max).
- codex — no dedicated flag; `-c model_reasoning_effort="<level>"` (config override, TOML value).
- cursor — no standalone flag; a bracket parameter on the model: `--model '<model>[effort=<level>]'`.
  Merges into an existing bracket list; replaces an `effort=` already there (the tag wins).

**Cursor with effort but no model** has nowhere to carry it → throw, naming the missing model.
Warn-and-ignore was rejected: it launches a session that looks configured and runs at default
effort, the same silent drop this CR fixes.

Out of scope, reported not fixed: `realizeLaunch` emits `--append-system-prompt` for codex and
cursor, which neither CLI accepts — filed as #36.

## NEXT

Landed on branch `fix/34-realize-def-effort` as a PR against main (Closes #34); both gates
self-asserted by:agent, the owner ratifies and merges at the PR. Follow-ups: #36 (instructions flag
on codex/cursor), #38 (backfill the agent/ node's Control Flow and Scenario map). #33 builds on this.
