# subagent-backend-governance

Internal skill: the concrete parent-side procedure for the cold-subagent dispatch path. Not
user-invocable — loaded by `dispatch-governance` only after it has already picked the **subagent**
strategy.

## When it loads

- `dispatch-governance` resolved a role as cold + one-shot (not `warm`/`interactive`) and needs the
  exact steps to realize it.

## What it does

- `dispatch prep` — allocate the envelope (id, brief file, result-file slot, instruction text).
- Invoke the caller's own harness Task/subagent tool with the envelope's `instruction` verbatim.
- `dispatch collect` — read and validate the result file against the verdict schema.

## What it does not do

- No mid-run nudge, no subagent inbox, one-shot request/response only, depth-1 only.
