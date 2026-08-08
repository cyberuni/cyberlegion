---
name: manage-inbox
description: "Use this skill when the user wants to check, read, or clear the owner mailbox — the durable inbox where headless and cron-started agents send their reports. Triggers: 'check my inbox', 'any reports for me', 'what did the agents send', 'read that report', 'ack that', 'mark it read', 'clear my owner inbox', or acting on a surfaced owner-mail doorbell."
---

# manage-inbox

The human's surface for the **owner mailbox** — the hub-level, session-independent inbox a standing
owner identity holds, where frameless agents (cron-started, no parent frame) push their reports. It
wraps the `cyberlegion` CLI's owner-scoped mail commands so a human roaming across sessions manages
the one owner mailbox from wherever they are.

> **Version pin.** Invocations read `npx cyberlegion@0.2.0 …` as a placeholder. Until the package
> is published, resolve the CLI from the workspace checkout (`packages/cyberlegion/bin/cyberlegion.mjs`)
> or the project's pinned version. Never invent a version number.

## Resolve the owner handle

The owner mailbox is a **standing** identity. Find it first:

```bash
npx cyberlegion@0.2.0 unit register --standing            # lists the standing owner record(s)
```

Use `$CYBERLEGION_OWNER` if set, else the single standing handle listed. If **no** standing owner
exists, there is no owner mailbox yet — create one with `unit register --standing --handle <name>` (that is a
deliberate act; do not auto-create it while just checking mail).

## List — what is waiting

```bash
npx cyberlegion@0.2.0 mail inbox --owner <handle>            # all owner mail, oldest-first
npx cyberlegion@0.2.0 mail inbox --owner <handle> --unread   # only what is new
```

The aggregate line reports `<N> messages (<U> unread)`. This is a **pull** from any session — the
same unread also **surfaces** into a root session automatically (the doorbell), so you may already
have seen it inline; listing is how you review deliberately.

## Read — peek without consuming

```bash
npx cyberlegion@0.2.0 mail read <msg-id> --owner <handle>
```

Prints the report body (sender, subject, id). **Read does not ack** — the message stays unread and
keeps surfacing until you explicitly clear it. Peeking is safe; it changes nothing.

## Ack — the only thing that clears it

```bash
npx cyberlegion@0.2.0 mail ack <msg-id> --owner <handle>
```

Ack is the sole read-state change and the sole signal that a report is handled — a surfaced message
that was merely printed into a session is **not** read until you ack it. Ack once you have actually
acted on (or consciously dismissed) the report; acking an already-acked or unknown id errors rather
than silently succeeding. Two concurrent acks of the same message resolve to exactly one success —
nothing is double-consumed.

## Reply — answer a frameless agent's question

A report may be a **question** a frameless agent could not ask live. Reply on its thread so a later
tick (or the agent's next run) picks up the answer:

```bash
npx cyberlegion@0.2.0 mail send --to <agent-or-thread-origin> --thread <t> --body "<answer>"
```

The thread carries the state across the agent's stateless re-runs.

## Boundaries

- This skill only manages the **owner** mailbox (`--owner`). A session's own inbox is the plain
  `mail inbox`/`read`/`ack` (no `--owner`) and is not this skill's concern.
- It is a thin CLI wrapper — it decides *nothing* about routing or dispatch (that is the Legate /
  `dispatch-governance`), and writes no state beyond the ack/reply the human directs.
