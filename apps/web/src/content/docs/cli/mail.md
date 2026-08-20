---
title: 'CLI: mail'
description: 'CLI reference for cyberlegion mail: send, inbox, read, ack, delete, await, watch, and hook.'
---

```sh
npx cyberlegion mail <send|inbox|read|ack|delete|await|watch|hook> ...
```

`mail` is durable inter-agent messaging — the store and the universal return channel every unit
gets once it registers. It is the **peer, non-authoritative** plane; see [Mail
Model](/concepts/mail-model/) for the full model and its contrast with the authoritative mux plane.

## send

```sh
npx cyberlegion mail send --to <peer> [--from <id>] [--subject <s>] [--body <text> | --body-file <path>] [--thread <id>] [--reply-to <msg>] [--no-nudge]
```

Send a message to a peer, by handle or id. Also available as the top-level alias `cyberlegion
send`.

| Option | Meaning |
|---|---|
| `--to <peer>` | recipient handle or id (required) |
| `--from <id>` | sender id (else this session's own identity) |
| `--subject <s>` | subject |
| `--body <text>` | message body |
| `--body-file <path>` | read body from a file, or `-` for stdin |
| `--thread <id>` | thread id |
| `--reply-to <msg>` | message id this replies to |
| `--no-nudge` | suppress the delivery doorbell (do not wake the recipient's pane) |

Delivery is durable first; waking the recipient's pane is a best-effort act on top and never fails
the send — a failed wake prints a warning instead. Output: `sent` (message id), `to`, `subject`,
`rung` (whether the doorbell fired).

## inbox

```sh
npx cyberlegion mail inbox [--unread] [--from <id>] [--thread <id>] [--owner <handle>]
```

List your mail. Also available as the top-level alias `cyberlegion inbox` (without `--owner`).

| Option | Meaning |
|---|---|
| `--unread` | only un-acked mail |
| `--from <id>` | filter by sender |
| `--thread <id>` | filter to messages carrying this thread id |
| `--owner <handle>` | target a standing owner's mailbox instead of this session's own |

Output: a `messages` table (`id`, `from`, `subject`, `read`) with an aggregate `<N> messages (<U>
unread)`. Suggests `mail read <id>` on the first unread message as a next step.

## read

```sh
npx cyberlegion mail read <msg-id> [--ack] [--owner <handle>]
```

Read a message. Peeking alone does not consume it; `--ack` acknowledges it in the same step.

| Option | Meaning |
|---|---|
| `--ack` | acknowledge the message in the same step (idempotent — no error if already acked) |
| `--owner <handle>` | read a standing owner's mailbox instead of this session's own |

Errors if the message id isn't in the resolved inbox. Without `--ack`, suggests `mail ack <id>` as
a next step.

## ack

```sh
npx cyberlegion mail ack <msg-id> [--owner <handle>]
```

Acknowledge a message — moves it out of the unread set. `--owner <handle>` acks a standing owner's
mailbox instead of this session's own.

## delete

```sh
npx cyberlegion mail delete <msg-id>
```

Permanently remove a message from your inbox, unread or already-acked.

## await

```sh
npx cyberlegion mail await --thread <id> [--from <h>] [--timeout <ms>] [--max-wait <s>]
```

Block until a thread-correlated reply arrives, print it, and ack it.

| Option | Meaning |
|---|---|
| `--thread <id>` | thread id to wait on (required) |
| `--from <h>` | only match a reply from this sender |
| `--timeout <ms>` | give up after this many ms with no match (`0` = wait forever); exits non-zero on timeout — default `600000` |
| `--max-wait <s>` | self-cap for one internal poll cycle, in seconds; returns the clean "waiting" sentinel at this cap so the caller can re-arm rather than blocking past a harness tool-timeout — default `240` |

Three outcomes:

| Outcome | Exit | Behavior |
|---|---|---|
| `matched` | 0 | the message is printed on stdout and acked |
| `waiting` | 0 | a stderr "waiting" line and nothing on stdout — the per-call `--max-wait` cap was hit with no match yet; re-run the same command to keep waiting |
| `timed-out` | 1 | a clear stderr message and nothing on stdout — `--timeout` elapsed with no match |

Prefer being woken over calling `await` — see [Architecture: Delegation &
return](/concepts/architecture/#delegation--return--prefer-wake-over-wait).

## watch

```sh
npx cyberlegion mail watch [--thread <id>] [--from <h>]
```

Stream new matching mail as it arrives. An observer only — it never acks. Ctrl-C to stop.

## hook

```sh
npx cyberlegion mail hook [--event <event>]
```

Emit the harness hook injection payload (raw JSON on stdout, not TOON). `--event` is `SessionStart`
(default) or `PostToolUse`. This is the command the surfacing hook `init` registers calls on every
matching harness event; it's rarely invoked by hand.

## Related

- [Mail Model](/concepts/mail-model/) — the address/correlation model and why mail stays
  non-authoritative
- [CLI: unit](/cli/unit/) — registration is what mints a mailbox
- [CLI: init](/cli/init/) — registers the hook that calls `mail hook`
- [Skill: manage-inbox](/skills/manage-inbox/) — the human-facing wrapper for the owner mailbox
