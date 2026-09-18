---
name: subagent-backend-governance
description: "Partial Skill: invoke by name only — the caller-side procedure for the subagent dispatch path — the cold one-shot case and the owned-unit case. Loaded by dispatch-governance when it picks the subagent strategy. Not triggered by users directly."
user-invocable: false
---

# Subagent Backend Governance

The concrete procedure `dispatch-governance` runs once it has picked the **subagent** strategy — a
one-shot unit with no live user channel, spawned through the caller's own Task tool. Three steps,
always in this order. What may reach that unit **mid-flight** is not decided by this backend but by
the unit's **role** — see *Mid-turn messaging is scoped by role*, below.

## 1. Resolve the agent def

```bash
npx cyberlegion@0.3.1 agent resolve <R> --format json
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

## Mid-turn messaging is scoped by role, not by backend

The subagent backend carries two different kinds of passenger, and whether anything may reach one
mid-flight follows the **role**, never the mechanism.

**A cold one-shot dispatch** — a judge, a grader, any unit whose worth is its independence — takes
no mid-run message. Nothing reaches it between its brief and its Task-result; that silence is what
makes the verdict its own. This is the unchanged case, restated in the Non-goals below.

**An owned unit realized as a subagent** — a unit some owner is running, which happens to have no
pane of its own — **may** be messaged mid-turn by **its owner**. Such a message lands as a turn in
the unit's own session, and a turn in a unit's own session is an **order**, not a suggestion: it is
how a change of course reaches a unit that has no pane to be nudged in. The channel belongs to the
**owner alone** — a third party that is not running the unit acquires no order channel by knowing
the unit exists.

**What such a message may carry is `relay-governance`'s rule, not this one.** An owner's mid-turn
message into a unit it is running **is** the ownership-chain case that governance defines — the
relaying unit is the receiver's own owner, and the decision arrives on a **turn** in the receiver's
own session. So load **`relay-governance`**, *The ownership chain: a relayed decision is not a peer
steer*, and apply it as written: the **four parts** a relayed decision must carry, what their
presence does and does not buy, the **attenuation** and **spent-once** clauses, and the two limits.
This skill states none of that a second time — one rule, one home.

What **is** this skill's own: **which role has an order channel at all**. A cold one-shot has none; an
owned unit's owner has one; a non-owner has none. Everything about the *content* of a decision
travelling on it belongs to `relay-governance`.

This does not reopen the seam that governance closes. Its peer-steer rule concerns **lateral** mail a
receiver fetched, where a faithful relay and a fabricated authority are indistinguishable, so an
embedded ratification is invalid. The owner's mid-turn message is **positional** — only the process
holding the Task pipe into a given unit can put a turn in it, so who sent it was never in question
the way a mail sender is. Acting under an order changes nothing about depth: an owned unit that takes
a mid-turn order still opens no deeper chain (see **Depth-1 only**, below).

## Non-goals

- **No mid-run nudge — for a cold one-shot.** Once a cold one-shot unit is dispatched, the caller
  does not ring it mid-flight; that dispatch is a pure request/response round-trip, not a
  conversation. This non-goal is scoped to the cold one-shot role: an **owned** unit realized as a
  subagent may be messaged mid-turn by its owner, per *Mid-turn messaging is scoped by role* above.
- **No subagent inbox.** A unit realized this way has no mailbox of its own — it takes the one brief
  inline and returns its one result as its **Task-result** (no result file). This holds for an owned
  unit too: its owner's mid-turn message arrives as a **turn**, not as mail, and confers no inbox.
  Any back-and-forth beyond those two shapes belongs to the **channel** strategy, not this one.
- **One-shot result only.** A single result, once — including for an owned unit whose owner steers
  it mid-turn: those messages are turns inside the one run, never extra results. A role that needs
  its *own* multi-round conversation with a peer was resolved wrong upstream —
  `dispatch-governance` should have picked **channel** or **run-inline**, not **subagent**, for an
  `interactive` role.
- **Depth-1 only.** A unit realized this way must not itself dispatch another cold unit — do not
  design for a caller → subagent → subagent chain deeper than one hop. A harness that lets a
  subagent spawn another may support depth 2 in principle, but this governance does not assume it.
