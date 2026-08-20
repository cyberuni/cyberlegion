---
title: Mail Model
description: The mail plane in email terms — address vs correlation, delivery, and why the mail plane is deliberately non-authoritative.
---

Mail is cyberlegion's durable, non-authoritative communication plane — see [Architecture: Two
planes](/concepts/architecture/#two-planes-mail-vs-mux) for how it contrasts with the authoritative
mux plane. This page is the mail model itself.

## In email terms

`to` and `thread` are different fields with different jobs — one is the envelope address, one is
the conversation the machine matches on. A reply carries both: `to` so it arrives, `thread` so it's
recognized among many in flight.

| Email | cyberlegion | Role |
|---|---|---|
| To: | `to` | **Address** — which mailbox (resolved to an agent id) |
| Subject: | `subject` | human title (optional) |
| Message-ID | `id` | this message's unique id |
| In-Reply-To | `replyTo` | "this answers message X" |
| References | `thread` | **Correlation** — a minted unique token; `mail await --thread t` matches exactly this exchange |

A subject can collide; a minted thread cannot.

## Identity is the mailbox

Mail is keyed by agent id; `unit register` mints the id. A mailbox is intrinsic to being a unit —
there is no separate `mailbox create` verb, and mailbox lifecycle is unit lifecycle. Receiving
requires registration (an unknown recipient fails to resolve); sending is free — any label may
send, which is what lets a cold subagent report back with no identity of its own.

## Two kinds of mailbox

- **A session's own inbox** — `mail inbox` / `mail read` / `mail ack` with no `--owner`, scoped to
  the calling session's own registered identity.
- **The owner mailbox** — a **standing**, session-independent identity's inbox, addressed with
  `--owner <handle>` on `inbox`/`read`/`ack`. This is where headless and cron-started agents with no
  live parent frame push their reports. See the [`manage-inbox` skill](/skills/manage-inbox/) for
  the human-facing workflow over it.

## Delivery: durable first, wake best-effort

`mail send` always writes the message durably first, then attempts to wake the recipient's pane as
a best-effort doorbell on top — a failed wake never fails the send (it prints a warning instead).
`--no-nudge` suppresses the doorbell outright. See [CLI: mail](/cli/mail/) for the full flag
reference.

## Waiting for a reply

Prefer being woken over blocking — see [Architecture: Delegation &
return](/concepts/architecture/#delegation--return--prefer-wake-over-wait). `mail await --thread
<id>` is the fallback for a context with no wake hook: it blocks until a thread-correlated reply
arrives, prints it, and acks it. `mail watch` is the read-only sibling — it streams new matching
mail as it arrives and never acks anything, so it's safe to run as a passive observer.

## Why it stays non-authoritative

An agent that receives mail and declines to act on it until a human confirms is behaving
correctly, not defectively — this is the trust boundary every harness with one enforces, and the
consensus mitigation in the multi-agent security literature. Granting mail authority on its own
would make it a prompt-injection hole. Authority is modeled separately, as a leash granted at
spawn time — a peer message never grants power, it only activates power a human already delegated.

## Related

- [Architecture](/concepts/architecture/) — the mail plane vs. the mux plane
- [CLI: mail](/cli/mail/) — the full command reference
- [Skill: manage-inbox](/skills/manage-inbox/) — managing the owner mailbox as a human
