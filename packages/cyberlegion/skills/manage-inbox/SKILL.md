---
name: manage-inbox
description: "Use this skill when the user wants to check, read, or clear the owner mailbox — the durable inbox where headless and cron-started agents send their reports. Triggers: 'check my inbox', 'any reports for me', 'what did the agents send', 'read that report', 'ack that', 'mark it read', 'clear my owner inbox', answering a question an agent left in a report, or acting on a surfaced owner-mail doorbell. Not for creating or binding the owner identity (init-cyberlegion) or a session's own mail (legate)."
---

# manage-inbox

The human's surface for the **owner mailbox** — the hub-level, session-independent inbox a standing
owner identity holds, where frameless agents (cron-started, no parent frame) push their reports. It
wraps the `cyberlegion` CLI's owner-scoped mail commands so a human roaming across sessions manages
the one owner mailbox from wherever they are.

> **Running the CLI.** Every `node scripts/cyberlegion.mjs …` command below runs the `cyberlegion` CLI
> this plugin ships. The path is relative to this skill's own directory, not the working directory.
> If you cannot resolve it, run the published CLI of the version that shipped this skill instead,
> with the same arguments: `npx -y cyberlegion@0.5.0`.

## Resolve the owner handle

The owner mailbox is a **standing** identity. Find it first:

```bash
node scripts/cyberlegion.mjs unit register --standing            # lists the standing owner record(s)
```

Pick the handle in this order, and scope every mail command below to it with `--owner <handle>`:

1. **`$CYBERLEGION_OWNER` is set** — use it as given; do not consult the standing list. If the CLI
   answers that it is not a standing owner, report that error to the user and stop. Never retry with
   a handle from the standing list: the variable named one owner, and a substitute is a guess.
2. **Unset, exactly one standing owner** — use that handle without asking.
3. **Unset, no standing owner** — tell the user there is no owner mailbox yet and stop. Do not run
   `unit register --standing --handle` yourself: creating the owner identity is a deliberate act
   that belongs to `init-cyberlegion`.
4. **Unset, more than one standing owner** — stop. Run no mail command with `--owner`. List every
   standing handle, and tell the user to set `CYBERLEGION_OWNER` to the one whose mailbox they mean.
   Never pick one: a wrong pick shows, or acks, another owner's mail.

## List — what is waiting

```bash
node scripts/cyberlegion.mjs mail inbox --owner <handle>            # all owner mail, oldest-first
node scripts/cyberlegion.mjs mail inbox --owner <handle> --unread   # only what is new
```

The aggregate line reports `<N> messages (<U> unread)`. This is a **pull** from any session — the
same unread also **surfaces** into a root session automatically (the doorbell), so you may already
have seen it inline; listing is how you review deliberately.

## Read — peek without consuming

```bash
node scripts/cyberlegion.mjs mail read <msg-id> --owner <handle>
```

Prints the report body (sender, subject, id). Do not add `--ack`. **Read does not ack** — the message stays unread and
keeps surfacing until you explicitly clear it. Peeking is safe; it changes nothing.

## Ack — the only thing that clears it

```bash
node scripts/cyberlegion.mjs mail ack <msg-id> --owner <handle>
```

Ack is the sole read-state change and the sole signal that a report is handled — a surfaced message
that was merely printed into a session is **not** read until you ack it. Ack once you have actually
acted on (or consciously dismissed) the report; acking an already-acked or unknown id errors rather
than silently succeeding. Two concurrent acks of the same message resolve to exactly one success —
nothing is double-consumed.

If the ack exits nonzero, tell the user it failed and why; never report the message as cleared.

## Reply — answer a frameless agent's question

A report may be a **question** a frameless agent could not ask live. Reply on its thread so a later
tick (or the agent's next run) picks up the answer:

```bash
node scripts/cyberlegion.mjs mail send --to <agent-or-thread-origin> --thread <t> --body "<answer>"
```

The thread carries the state across the agent's stateless re-runs.

## Boundaries

- This skill only manages the **owner** mailbox (`--owner`). A session's own inbox is the plain
  `mail inbox`/`read`/`ack` (no `--owner`) and is not this skill's concern.
- Creating or binding the owner identity is `init-cyberlegion`'s job; hand those requests to it.
- It is a thin CLI wrapper — it decides *nothing* about routing or dispatch (that is the Legate /
  `dispatch-governance`), and writes no state beyond the ack/reply the human directs.
