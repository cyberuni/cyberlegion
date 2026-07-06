---
name: subagent-backend-governance
description: "Internal skill: the parent-side procedure for the cold-subagent dispatch path — prep an envelope, invoke the caller's own harness Task/subagent tool, collect and validate the result. Loaded by dispatch-governance when it picks the subagent strategy. Not triggered by users directly."
user-invocable: false
---

# Subagent Backend Governance

The concrete procedure `dispatch-governance` runs once it has picked the **subagent** strategy — a
cold, one-shot unit with no live user channel and no expectation of a multi-round conversation.
Three steps, always in this order.

## 1. Prep the envelope

```bash
npx cyberlegion@<version> dispatch prep --agent <R> --brief-file <B> [--verdict-schema <V>] --format json
```

Allocates a dispatch `id`, a brief file, and a result-file slot, and returns an envelope carrying
`instruction` — the exact text to hand the subagent — plus `briefFile` and `resultFile` paths. This
command **spawns nothing and never invokes a Task tool itself**; it only allocates state and hands
back what the caller needs to do the spawning.

## 2. Invoke the caller's own Task/subagent tool

Pass the envelope's `instruction` **verbatim** to whatever subagent-spawning tool the **calling
harness** provides (e.g. an `Agent`/`Task` tool) — never a `cyberlegion` command. The instruction
already tells the unit to read its brief at `briefFile` and write its result JSON to `resultFile`;
do not paraphrase or re-derive it. `cyberlegion` has no subagent-spawning primitive of its own by
design — spawning is always the caller's own mechanism, because only the caller's harness knows how.

## 3. Collect and validate the result

```bash
npx cyberlegion@<version> dispatch collect <id> --verdict-schema <V> --format json
```

Reads `resultFile`, validates it against `V` when a schema was given, and returns the validated
result (or a validation failure) — the subagent path's counterpart to `mail await` on the channel
path.

## Non-goals

- **No mid-run nudge.** Once dispatched, the parent does not ring the unit mid-flight; it is a pure
  request/response round-trip, not a conversation.
- **No subagent inbox.** A cold unit has no mailbox of its own — it reads exactly the one brief file
  and writes exactly the one result file. Any back-and-forth beyond that belongs to the **channel**
  strategy, not this one.
- **One-shot only.** A single result, once. A role that needs multiple rounds was resolved wrong
  upstream — `dispatch-governance` should have picked **channel** or **run-inline**, not
  **subagent**, for an `interactive` role.
- **Depth-1 only.** A unit realized this way must not itself dispatch another cold unit — do not
  design for a caller → subagent → subagent chain deeper than one hop. A harness that lets a
  subagent spawn another may support depth 2 in principle, but this governance does not assume it.
