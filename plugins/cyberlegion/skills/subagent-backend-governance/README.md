# subagent-backend-governance

Internal skill: the concrete parent-side procedure for the cold-subagent dispatch path. Not
user-invocable — loaded by `dispatch-governance` only after it has already picked the **subagent**
strategy.

## When it loads

- `dispatch-governance` resolved a role as cold + one-shot (not `warm`/`interactive`) and needs the
  exact steps to realize it.

## What it does

- `cyberlegion agent resolve <R>` — resolve the def's model/effort/harness/instructions.
- Build the subagent instruction from the resolved def + the caller-supplied brief, and invoke the
  caller's own harness Task/subagent tool with it.
- Take the subagent's Task-result (its own final returned message) as the verdict — no result file,
  no schema validation (deferred to a `mail --verdict-schema` capability).

## What it does not do

- No mid-run nudge, no subagent inbox, one-shot request/response only, depth-1 only.
