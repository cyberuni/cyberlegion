---
cr-ref: github-28-relay-request-scope
project: cyberlegion-plugin
status: active
todos:
  - content: "explore: re-open dispatch.feature; rewrite the four-part scenarios to the request-answering model"
    status: pending
  - content: "spec gate: cold spec-judge, structural diff, re-freeze, ledger gate line"
    status: pending
  - content: "deliver: relay-governance + subagent-backend-governance (SKILL + README) realigned; changeset"
    status: pending
  - content: "impl gate: cold impl-judge over the frozen scenarios; pnpm verify, check:suite, check:metaphor-free"
    status: pending
  - content: "handoff: PR closing #28 (never merge), report to the dispatching unit"
    status: pending
---

# github-28 — a relayed decision's scope comes from the request it answers

CR source: cyberuni/cyberlegion issue #28 (decision request: two-part scope here vs three-part in
the sibling corpus). The maintainer answered: both forms are wrong — the sibling corpus has since
replaced the model it was framed against (cyberuni/cyberfleet PR #62).

**The model to align to.**

- **Relayer**: sends the user-channel holder's words as said — drops only words addressed to
  itself, adds nothing: no envelope (no "decided, relayed by…", no where / relayer / scope labels),
  no next steps. Unsure the words cover the whole request → ask the user-channel holder, relay
  nothing until answered.
- **Receiver** (ownership chain, unchanged: own owner + a turn in its own session): a turn is a
  decision only when it answers the receiver's **own outstanding decision request**. Scope = the
  action, target and revision that request named, **narrowed** by the words; a held-back part is
  reported as not approved, never re-asked. Words answering no request are an **order**, never a
  decision.
- **Record**: the words, where said, the relaying unit and the scope go on the work item's mail
  thread (audit), never into the delivered text; the receiver never reads scope from it.
- Unchanged: attenuation, spent-once, the two limits, peer-steer triage.

**Closes the revision seam.** The revision comes from the receiver's own request, so this contract
needs no revision concept of its own and states the same scope as the sibling corpus.

**Re-open.** Rewriting the four-part scenarios narrows/rewrites a frozen suite (Clearance) —
pre-authorized in the CR: the dispatching brief orders the re-open on the maintainer's yes to #28.

## NEXT

Explore: edit `dispatch/README.md` prose, then `dispatch.feature` (drop `@frozen`).
