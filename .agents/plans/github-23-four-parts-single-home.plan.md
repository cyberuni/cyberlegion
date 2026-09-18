---
cr-ref: github-23-four-parts-single-home
project: cyberlegion-plugin
status: active
todos:
  - content: "explore: merge the two four-part statements in dispatch/README.md into one home; draft additive scenarios"
    status: completed
  - content: "spec gate: cold spec-judge, structural diff (expect addOnly), ledger gate line"
    status: completed
  - content: "deliver: relay-governance carries the single statement; subagent-backend-governance references it"
    status: completed
  - content: "impl gate: cold impl-judge over the new frozen scenarios; pnpm verify + check:metaphor-free"
    status: completed
  - content: "handoff: PR against main, file the three carried-over follow-ups, report to operator"
    status: completed
---

# github-23 — one home for the four-part rule

CR source: cyberuni/cyberlegion issue #23. Follow-up reconciling #17 (PR #21) and #18 (PR #22),
which landed minutes apart on the same `dispatch/` spec node.

**Duplication.** The four parts (the verbatim words, where they were said, the relaying unit, the
scope of one action on one target), the attenuation clause, the two limits, and the dropped-revision
note are stated in full in both `relay-governance` and `subagent-backend-governance`, and twice over
inside `dispatch/README.md`.

**Divergence.** #17 makes the four parts a **gate** (a missing part drops back to
escalate-for-ratification); #18 makes them an **audit trail** (well-formed and auditable after the
fact, verifying nothing in the moment).

**The merged reading.** Both halves hold and the single statement carries both explicitly:
well-formedness **is** checkable on its face in the moment, so it gates adoption; **truth** is not
checkable, so the parts buy audit, never verification. A present, well-formed decision can still be
fabricated or over-attenuated and the receiver cannot tell.

**Single home:** `relay-governance` — it already owns the receive-side triage and the
ownership-chain exception in its own Boundaries, and the mid-turn case *is* an ownership-chain case
(own owner, on a turn in the unit's own session). `subagent-backend-governance` keeps what is its
own — which role has the channel at all — and references the rule for what a decision must carry.
`dispatch-governance` is the wrong home: it disclaims authority and relay explicitly, owning strategy
choice only.

Suite edit is **additive only** — the existing scenarios are not narrowed; the merged reading adds
the checkable-on-its-face / not-a-verification distinction and the one-home binding.

Out of scope, reported not fixed: the banned persona term "Council" in the #18 amendment (outside
the metaphor guard's `src/` + `.agents/spec/` scope); the three follow-ups carried in the #17 ledger
shard (filed as issues at handoff, not fixed).

## NEXT

Landed. `relay-governance` is the single home of the four parts, the attenuation and spent-once
clauses and the two limits, carrying both halves explicitly — well-formedness is checkable on its
face and gates adoption; truth is not checkable and the parts buy audit, not verification.
`subagent-backend-governance` references that rule and keeps only which role has an order channel.
The `dispatch/` node states it once and carries four additive frozen scenarios. Both gates
self-asserted `by: agent` within the auto-all leash — the positional human ratification is still
outstanding at the PR. The revision part is named as an open cross-repo seam, deliberately not
restored. No resume action remains in this brief.
