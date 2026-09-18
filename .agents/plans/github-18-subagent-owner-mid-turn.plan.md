---
cr-ref: github-18-subagent-owner-mid-turn
project: cyberlegion-plugin
status: active
todos:
  - content: "explore: draft the role-scoped mid-turn rule on dispatch/ (README + additive feature scenarios)"
    status: completed
  - content: "spec gate: cold spec-judge, freeze check (additive-only), ledger gate line"
    status: completed
  - content: "deliver: amend subagent-backend-governance SKILL.md + README to the frozen contract"
    status: completed
  - content: "impl gate: cold impl-judge over the frozen scenarios; pnpm verify"
    status: completed
  - content: "handoff: PR against main, report to operator"
    status: completed
---

# github-18 — scope the mid-run-nudge ban by role

CR source: cyberuni/cyberlegion issue #18.

`subagent-backend-governance` bans a mid-run nudge outright. That is right for a **cold
one-shot** dispatch (a judge's independence depends on nothing reaching it mid-run) and too
broad for an **owned unit realized as a subagent**, whose owner's mid-turn message is the only
way a change of course reaches it. Scope the rule by **role**, not by backend.

Unchanged: depth-1 guidance, the cold one-shot non-goals.

Overlap: sibling issue #17 amends `relay-governance` with the same four-part scope
requirement for a relayed decision. Keep wording self-contained here; do not edit that file.

## NEXT

Landed. The `dispatch/` node carries six additive frozen scenarios for the role-scoped mid-turn
order channel, and `subagent-backend-governance` carries the matching rule in its SKILL.md and
README. Both gates self-asserted `by: agent` within the auto-all leash — the positional human
ratification is still outstanding at the PR. No resume action remains in this brief.
