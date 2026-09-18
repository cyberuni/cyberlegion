---
cr: github-17-relay-ownership-chain
status: active
todos:
  - content: "Draft the spec edit: split the relayed-ratification rule by relationship"
    status: completed
  - content: "Add the ownership-chain scenarios to dispatch.feature (additive only)"
    status: completed
  - content: "Spec gate: structural diff + cold spec-judge, then freeze/ledger"
    status: completed
  - content: "Deliver: amend relay-governance SKILL.md + README"
    status: completed
  - content: "Impl gate: cold impl-judge, pnpm verify"
    status: completed
  - content: "Handoff: PR against main, report to operator"
    status: completed
---

# github-17 — a decision relayed down the ownership chain is not a peer steer

CR source: https://github.com/cyberuni/cyberlegion/issues/17

`relay-governance` voids **any** ratification carried in relayed mail. Right for a peer steer,
too broad for the ownership chain. Split the rule by **relationship**, not by transport:

- **Peer steer** — unchanged. A ratification claim fetched from a unit with no authority over the
  receiver is invalid; bundle-adopt / bundle-reject still apply.
- **Ownership chain** — a decision relayed by the receiver's **own owner**, on a turn placed in the
  receiver's session, is adoptable **within its named scope and nothing adjacent**, provided it
  carries four parts: the Council's verbatim words, where they were said, the relaying unit, and
  its scope (one action, one target). Authority attenuates at every hop.

State plainly what this does not buy: `unit nudge --message` writes caller-controlled text into any
addressable pane and records no caller identity, so position is a structural fact, not a proof; a
receiver also cannot detect a relay that passed on more than the relayer held.

Touched: `.agents/specs/cyberlegion-plugin/dispatch/{README.md,dispatch.feature}`,
`packages/cyberlegion/skills/relay-governance/{SKILL.md,README.md}`.

Sibling: issue #18 amends `subagent-backend-governance` with the same four-part requirement in a
parallel worktree — do not touch that file; keep this wording self-contained.

## NEXT

Landed. The spec gate froze 11 additive scenarios on `dispatch.feature` (ALIGNED, oracle/builder/
architect all PASS) and the impl gate approved the amended `relay-governance` SKILL.md 11/11. Both
gates self-asserted within the `auto-all` leash; the ledger shard carries the verdicts. Nothing
remains to resume.
