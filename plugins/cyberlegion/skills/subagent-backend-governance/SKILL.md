---
name: subagent-backend-governance
description: "Internal skill: the parent-side procedure for the cold-subagent dispatch path. Loaded by dispatch-governance when it picks the subagent strategy. Not triggered by users directly."
user-invocable: false
---

# Subagent Backend Governance

The concrete procedure `dispatch-governance` runs once it has picked the **subagent** strategy — a
cold, one-shot unit with no live user channel and no expectation of a multi-round conversation.
Three steps, always in this order.

## 1. Resolve the agent def

```bash
npx cyberlegion@<version> agent resolve <R> --format json
```

Returns `model`, `effort`, `harness`, and `instructions` for role `R`. `cyberlegion` allocates no
dispatch id, no brief file, and no result slot for this path — it only resolves the def; the caller
builds the instruction itself.

## 2. Build the instruction and invoke the caller's own Task/subagent tool

Compose the subagent instruction from the resolved def (`model`, `effort`, `instructions`) plus the
caller-supplied brief `B`, and pass it to whatever subagent-spawning tool the **calling harness**
provides (e.g. an `Agent`/`Task` tool) — never a `cyberlegion` command. Name `subagent_type: <R>`
when the harness recognizes it, but always inline the model/effort/instructions too so the same
instruction is correct even when the harness has no such named subagent type. `cyberlegion` has no
subagent-spawning primitive of its own by design — spawning is always the caller's own mechanism,
because only the caller's harness knows how.

## 3. Take the Task-result as the verdict

The subagent's **Task-result — its own final returned message** — is the verdict. There is no
`dispatch collect`, no result file, and no schema validation step: the caller reads the return value
its own Task tool hands back, the same way it would for any other subagent spawn. (Structured
verdict-schema validation on that return is a deferred `mail --verdict-schema` capability, not
present today.)

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
