---
name: relay-governance
description: "Internal skill: the Legion's report/ask contract — how a headless agent returns a result or surfaces a question it cannot answer, keyed on its OWN lifecycle (Task-spawned subagent vs spawned peer vs bare top-level/cron). A subagent returns needsInput to its caller frame; a bare cron session with no frame pushes mail to the standing owner and exits. Loaded by dispatch-governance and by any headless agent (headless-legate, sdd-automaton, cold judges). Not triggered by users directly."
user-invocable: false
---

# Relay Governance

How a **headless** agent — one with no live user channel — reports a result or surfaces a question
it cannot answer on its own. The transport is **not a preference**: it is forced by the agent's own
lifecycle, the same way `dispatch-governance` forces `run-inline` from "do I have a seat?". This
contract is loaded by `dispatch-governance` (to relay a callee's `needsInput`) and by every headless
agent (`headless-legate`, `sdd-automaton`, the cold judges) to know how *it* reports.

## The one probe: who, if anyone, collects my return?

A model is not running between turns. Whatever a headless agent emits must reach a collector, or be
pushed to a durable sink and picked up later. So before reporting, answer one question — **who
collects my return value?** — and the transport follows.

| Lifecycle | Who collects | Report / ask transport | Resume |
|---|---|---|---|
| **Subagent** — Task-spawned; a caller frame awaits the return | the spawner | Return a `DispatchResult` / verdict packet with `needsInput` populated. **Cannot** `mail await` — the context dies at return. | The spawner collects, gathers answers, re-invokes. |
| **Spawned peer / channel** — a spawner `unit spawn`s then `mail await`s on the thread, or a wrapper reads stdout | the spawner / wrapper | Return the packet, **or** reply on the mail thread the spawner awaits. | The spawner relays. |
| **Bare top-level / cron** — a scheduler started this session; **no frame** reads the return | nobody | **Push `mail send` to the standing owner, then exit.** This is the Slack/PR analog. | A later tick (cron) or the owner's reply on the thread re-reads it; state lives in the thread, not the process. |

The rule mirrors `run-inline`: a cold subagent **must** return (it cannot await); a bare cron session
**must** push mail (nothing collects its return). Do not pick a transport by taste — read it off the
lifecycle.

## Framed (subagent / peer): return, do not push

If a frame collects your return, use it. Populate `needsInput` on the `DispatchResult`
(`dispatch-governance`'s shape) with the batched questions and return. Never open a mailbox to a
human when your own caller is already awaiting you — that just adds a hop nobody reads. A
`headless-legate` fanning out N briefs collects every callee's `DispatchResult` and **batches** their
`needsInput` into its own return; whatever spawned the Legate owns the user loop and re-invokes it
once answers land.

## Frameless (bare top-level / cron): push to the standing owner, then exit

No frame reads your return — so report by pushing durable mail to the **standing owner** identity and
exiting. Resolve the owner recipient in this order:

1. an explicit `--report-to <handle>` / brief-carried handle;
2. else `$CYBERLEGION_OWNER`;
3. else the hub's standing owner (`cyberlegion unit register --standing` with no handle lists them; a single
   standing record is the owner).

Then:

```bash
npx cyberlegion@<version> mail send --to <owner> --subject "<what>" --body-file <report> [--thread <t>]
```

and **exit**. Do not park waiting for a live answer — a cron session has no one to answer live. The
report lands in the owner's durable inbox and **surfaces into the human's next root session** (the
`surfacing` node injects standing-owner unread mail into any non-unit session). The human reads it
inline and acts on their own cadence; a later scheduled tick, or the owner's threaded reply, resumes
the work — the mail **thread** carries the state across runs, so a stateless re-spawn reconstructs
from it.

**Fail loud — never drop the report.** If no standing owner resolves (no `--report-to`, no
`$CYBERLEGION_OWNER`, no standing record on the hub), do **not** silently succeed or invent a
recipient. Surface the failure (nonzero exit, a clear message naming the missing owner and the fix:
`cyberlegion unit register --standing --handle <h>`). A report with nowhere to go is a stop, not a no-op.

## Read is a deliberate act — surfacing is not a receipt

Pushing owner mail makes it *visible*; it does not make it *read*. Surfacing shows the message in a
session's context (a model printing text), which is never proof a human read it. So the owner
mailbox never auto-acks on surface — it re-surfaces every turn until the human explicitly
`mail ack --owner`s it (via the manage-inbox skill or by telling the agent). A relaying agent must
not treat "I sent the mail" as "the human handled it"; the ack is the only signal that closes the
loop, and it arrives on a later turn, not this one.

## Boundaries

- Relay owns **report/ask transport**; `dispatch-governance` still owns **strategy** choice
  (channel / run-inline / subagent). A dispatch picks a strategy; relay decides how the result or an
  unanswerable question gets home.
- This governance supersedes the ad-hoc "batch `needsInput` and relay up" prose formerly inlined in
  `headless-legate` and in `dispatch-governance`'s result section — those load this contract now
  rather than restating it.
- The frameless→owner branch depends on the standing owner identity and owner-mail surfacing shipped
  in the `cyberlegion` CLI (`unit register --standing`, `mail send/--owner`, the surfacing hook). It states the
  *transport*; the CLI carries the mechanism.
