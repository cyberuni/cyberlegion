---
cr-ref: github-29-metaphor-guard-scope
project: cyberlegion
status: active
todos:
  - content: "explore: charter scope = guard scope (src, spec, skills, agents, plugin spec); additive scenarios per new root"
    status: completed
  - content: "spec gate: cold spec-judge; structural diff on metaphor-free.feature (expect addOnly); ledger gate line"
    status: completed
  - content: "rename: the banned ratifier term to user-channel holder in plugin skills + plugin spec (ratified re-open)"
    status: completed
  - content: "deliver: guard rebased to repo root, roots widened, plugin ledger excluded; test-first"
    status: completed
  - content: "impl gate: cold impl-judge over frozen scenarios; pnpm verify"
    status: completed
  - content: "handoff: PR against main (Closes #29), report to operator, do not merge"
    status: completed
---

# github-29 — the vocabulary ban reaches as far as its guard

CR source: cyberuni/cyberlegion issue #29.

**Ratified: route A.** First relayed by mail from the operator session: "A. cyberfleet is the
consumer, should not leak into cyberlegion". Then confirmed in-session by the owner in this unit's
own pane: "Route A confirmed, go ahead". Scope: widen the guard to the plugin layer and the plugin's
project spec, and rename the banned term everywhere it appears in those trees. This is a
dependency-direction rule: cyberlegion sits upstream of cyberfleet, so no layer of it, plugin
included, names its consumer's personas.

**Scope after the change.** The guard scans `packages/cyberlegion/{src,.agents/spec,skills,agents}`
and `.agents/specs/`, with every `ledger/` under a spec tree excluded as provenance. `docs/adr/`
and `.agents/plans/` stay out: they are verbatim records of past decisions and work.

**Rename.** The only banned term in the new roots is the name for the position that holds the user
channel and ratifies (19 hits outside ledgers, 6 files, of which 17 are in the new roots). It becomes
**user-channel holder**. `relay-governance` already describes it as "the position holding the user
channel". The `dispatch.feature` sites sit in frozen scenarios. Renaming them is a rewrite that
leaves the meaning unchanged, cleared by the route-A ratification above.

## NEXT

Landed as a PR against main (Closes #29), left unmerged until the owner approves it. The guard scans the CLI's src and
spec tree, the plugin's skills and agents, and the plugin's project spec, excluding both ledgers. The
charter states that this reach is the ban's reach. The ratifying position is now the user-channel
holder throughout the plugin. Both gates self-asserted `by: agent`; the owner ratifies at the PR. Four
backlog follow-ups are recorded in the CLI ledger shard and not filed. No resume action remains.
