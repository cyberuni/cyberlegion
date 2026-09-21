---
cr-ref: github-33-spawn-model-effort
project: cyberlegion
status: active
todos:
  - content: "explore: unit/lifecycle spawn seam + agent/ effort override — additive scenarios, CFG + map rows"
    status: completed
  - content: "spec gate: cold spec-judge, structural diff (expect addOnly on both suites), ledger gate line"
    status: completed
  - content: "deliver: test-first --model/--effort wiring, spawn output reports model + effort, --help + docs"
    status: completed
  - content: "impl gate: cold impl-judge over the new frozen scenarios"
    status: completed
  - content: "handoff: PR stacked on #34's PR (Closes #33), mail operator"
    status: completed
---

# github-33 — unit spawn --model / --effort

CR source: cyberuni/cyberlegion issue #33. Builds on #34 (per-harness effort mapping in
`realizeLaunch`), so this branch stacks on `fix/34-realize-def-effort`.

**Precedence:** flag > agent def > harness default. A flag changes one launch and never writes back to
the def. The flags work with a bare `--harness` too. `unit spawn` output reports the model and effort
it launched with (`(harness default)` when no source sets one — the `agent show` convention).

**Reuse:** `--effort` goes through #34's per-harness mapping, so a cursor `--effort` with no model from
any source refuses before anything is created.

Out of scope: `service start` shares the spawn options and so accepts the flags too, but its output is
unchanged; `--append-system-prompt` on codex/cursor is #36.

## NEXT

Landed on branch `feat/33-spawn-model-effort` as a PR stacked on #34's PR (Closes #33); both gates
self-asserted by:agent, the owner ratifies and merges at the PR — after #34's PR. Related: #36
(instructions flag on codex/cursor), #38 (agent/ node backfill), #40 (`pnpm cl dev` prints nothing).
