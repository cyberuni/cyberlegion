# subagent-backend-governance

Partial Skill: invoke by name only — the concrete caller-side procedure for the subagent dispatch path. Not
user-invocable — loaded by `dispatch-governance` only after it has already picked the **subagent**
strategy.

## When it loads

- `dispatch-governance` resolved a role as one-shot (not `interactive`) and needs the exact steps to
  realize it — whether that unit is a cold judge or a unit some owner is running.

## What it does

- `cyberlegion agent resolve <R>` — resolve the def's model/effort/harness/instructions.
- Build the subagent instruction from the resolved def + the caller-supplied brief, and invoke the
  caller's own harness Task/subagent tool with it.
- Take the subagent's Task-result (its own final returned message) as the verdict — no result file,
  no schema validation (deferred to a `mail --verdict-schema` capability).

## What it does not do

- No mid-run nudge **for a cold one-shot** (a judge's independence depends on it), no subagent
  inbox, one result once, depth-1 only.

## Mid-turn messaging

Scoped by **role**, not by the subagent backend. A cold one-shot takes no mid-run message. An
**owned** unit realized as a subagent may be messaged mid-turn by **its owner**, and those messages
land as turns — so they are orders. Authority attenuates: the owner passes on no more than it holds,
and a relayed Council decision is actionable only with the decision verbatim, where it was said, the
relaying unit, and a scope covering the action and its target.
