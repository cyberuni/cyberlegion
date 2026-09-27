---
cr-ref: github-63-cursor-effort-no-model
project: cyberlegion
status: active
todos:
  - content: "live check: does cursor-agent take an effort with no explicit model? (decides outcome 1 vs 2)"
    status: completed
  - content: "explore: replace #34's cursor refusal scenarios in agent/ and unit/lifecycle/ + README prose"
    status: completed
  - content: "spec gate: cold spec-judge, structural diff (rewrite, pre-authorized by the CR), ledger gate line"
    status: completed
  - content: "deliver: test-first realizeLaunch effortNotApplied + CLI stderr warning; rebuild dist; pnpm verify"
    status: completed
  - content: "impl gate: cold impl-judge over the replaced frozen scenarios"
    status: completed
  - content: "handoff: PR against main (Closes #63), mail operator"
    status: completed
---

# github-63 — cursor effort with no model must not throw

CR source: cyberuni/cyberlegion issue #63. Reverses part of #34's frozen contract; the issue itself
pre-authorizes replacing the refusal scenario (Clearance floor cleared by the CR).

**Live check (cursor-agent 2026.09.26, signed in).** Local config `model.modelId` is `default`
(display `auto`). `-p --model <m>` with `auto[effort=high]`, `default[effort=high]`,
`auto[effort=bogus]`, `auto[bogus=1]` all fail `Cannot use this model`. Bare `auto` runs.
So nothing carries an effort without naming a model → **outcome 2**.

**Outcome 2.** Cursor spawn with effort and no model launches at cursor's default (no `--model`),
warns on stderr, and reports the effort as `<level> (not applied)` in the spawn output.

Observed, out of scope: on this account every bracket form was rejected, including the `--help`
example `claude-opus-4-8[context=1m,effort=high,fast=false]` and `gpt-5.2[effort=high]`; the models
list carries effort baked into flat ids (`claude-opus-5-high`). #34's model+effort bracket mapping may
not launch on this account.

## NEXT

Landed on branch `fix/63-cursor-effort-no-model` as a PR against main (Closes #63); both gates
self-asserted by:agent, the owner ratifies and merges at the PR. Follow-up: the bracket-rejection
observation above, recorded in the ledger shard and filed as #72.
