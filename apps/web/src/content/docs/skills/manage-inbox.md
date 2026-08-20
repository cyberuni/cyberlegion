---
title: 'Skill: manage-inbox'
description: What the manage-inbox skill does, how it wraps the owner-scoped mail commands, and what it leaves alone.
---

`manage-inbox` is the human's surface for the **owner mailbox** — the hub-level,
session-independent inbox a standing owner identity holds, where frameless agents (cron-started, no
parent frame) push their reports. It wraps the [`cyberlegion` CLI](/cli/)'s owner-scoped mail
commands so a human roaming across sessions manages the one owner mailbox from wherever they are.
It is a thin wrapper: it decides nothing about routing or dispatch, and writes no state beyond the
ack or reply the human directs.

## Run it

```text
/cyberlegion:manage-inbox
```

It also triggers on prose: "check my inbox," "any reports for me," "what did the agents send,"
"read that report," "ack that," "mark it read," "clear my owner inbox," or acting on a surfaced
owner-mail doorbell.

## What it does

### Resolve the owner handle

Finds the standing owner identity first — `unit register --standing` lists it. Uses
`$CYBERLEGION_OWNER` if set, else the single standing handle listed. If none exists yet, that's a
deliberate gap: the skill does not auto-create an owner mailbox while just checking mail.

### List — what is waiting

`mail inbox --owner <handle>`, optionally `--unread`. The aggregate line reports `<N> messages (<U>
unread)`. This is a **pull** — the same unread mail also surfaces automatically into a root
session (the doorbell), so listing is for reviewing deliberately, not the only way to see it.

### Read — peek without consuming

`mail read <msg-id> --owner <handle>`. Read does not ack — the message stays unread and keeps
surfacing until explicitly cleared. Peeking is safe; it changes nothing.

### Ack — the only thing that clears it

`mail ack <msg-id> --owner <handle>`. Ack is the sole read-state change and the sole signal that a
report is handled. Acking an already-acked or unknown id errors rather than silently succeeding;
two concurrent acks of the same message resolve to exactly one success.

### Reply — answer a frameless agent's question

`mail send --to <agent> --thread <t> --body "<answer>"`. A report may be a question a frameless
agent could not ask live; replying on its thread lets a later tick or the agent's next run pick up
the answer, since the thread carries state across the agent's stateless re-runs.

## Rules the skill follows

- It only manages the **owner** mailbox (`--owner`) — a session's own inbox (plain `mail
  inbox`/`read`/`ack`, no `--owner`) is [`legate`](/skills/legate/)'s concern, not this skill's.
- It is a thin CLI wrapper: it decides nothing about routing or dispatch.

## What it will not do

It will not auto-create a standing owner identity just to satisfy a "check my inbox" request — that
mint is a deliberate, separate act.

## Related

- [Mail Model](/concepts/mail-model/) — the owner mailbox vs. a session's own inbox
- [CLI: mail](/cli/mail/) — the full `--owner`-scoped command reference
- [Skill: init-cyberlegion](/skills/init-cyberlegion/) — mints and binds the owner identity this
  skill manages mail for
