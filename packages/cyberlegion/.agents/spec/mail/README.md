---
spec-type: behavioral
concept: [cyberlegion]
---

# mail — durable inter-agent messaging

Send, list, and read/ack durable mail over the file queue (the `Store`). Migrated from cyberfleet's
`messaging` node in `legion-extract-core` (CR-2); send/inbox/read/ack authored to a behavioral spec +
suite here. Thread correlation (`send --thread/--reply-to`, `inbox --thread`), `mail delete`, the
blocking `mail await`, and `mail watch` are delivered in `legion-wake` (CR-4, absorbing the
`cyberfleet-verdict-roundtrip` work) and specified in [`wake/wake.feature`](../wake/wake.feature)
rather than here, since they are wake-shaped behaviors layered on top of this node's plain
send/inbox/read/ack.

## Use Cases

**Subject** — durably delivering a message to a peer's inbox and letting that peer list, peek at, and
consume it, without losing or duplicating anything:

- **send writes exactly one collision-free, time-ordered message** — `mail send --to <peer> --body
  <text>` resolves the recipient by handle or id, mints an id of the form `<epochMs>-<hex>` (random
  hex tail keeps two sends in the same millisecond distinct), and writes exactly one message file into
  the recipient's inbox; lexical id order is time order, so a later send always sorts after an
  earlier one. An unknown recipient throws (naming it) and writes nothing — no partial message ever
  lands in any inbox.
- **The body comes from --body, --body-file <path>, or --body-file - (stdin)** — `resolveBody` takes
  the first source given, in that priority; when neither is given it throws asking for one of them.
- **inbox lists the caller's mail, oldest-first, with an aggregate** — `mail inbox` lists as a TOON
  list (`messages[N]{id,from,subject,read}:`) plus a `<N> messages (<U> unread)` aggregate; an empty
  inbox reports "0 messages (0 unread)" rather than erroring. `--unread` restricts to un-acked mail;
  `--from <handle-or-id>` restricts to one sender; both compose with the default oldest-first order.
- **read peeks — it does not consume** — `mail read <msg-id>` prints the message's body (from/subject
  included) without changing its read state: the message remains unread and is still returned by a
  later `mail inbox --unread`. An unknown message id errors.
- **ack is the consumer** — `mail ack <msg-id>` moves the message out of the unread set into the
  caller's read set; it is the only command that changes a message's read state. Acking an
  already-acked or unknown message id errors rather than silently succeeding.
- **The standing owner mailbox is readable and ackable from any session** — `mail send --to <owner>`
  resolves the standing record (standing-precedence, see `identity/`) and delivers into the owner
  inbox. `mail inbox`, `mail read`, and `mail ack` take an `--owner <handle>` selector that targets a
  **standing** record's inbox instead of the caller's own — so a human roaming across sessions manages
  the one hub-level owner mailbox from wherever they are. `--owner` on a handle that is **not** a
  standing record errors (it never reads a session's inbox as an owner mailbox). Read still peeks and
  `ack` is still the only read-state change; two concurrent `mail ack --owner` of the same message
  resolve to exactly one success and one error (the loser throws on an already-acked message), so no
  report is double-consumed or lost.

**Non-goals** — thread correlation (`send --thread/--reply-to`, `inbox --thread`), `mail delete`,
`mail await`, and `mail watch` — all spec'd in [`wake/wake.feature`](../wake/wake.feature); this node
is plain send/inbox/read/ack only.

Every scenario in [`mail.feature`](./mail.feature) maps to one of these behaviors:

| Behavior | What it covers |
|---|---|
| **send is collision-free and time-ordered** | one message per send; `<epochMs>-<hex>` id; oldest-first sort; unknown recipient errors with no partial write; addressable by handle or id |
| **body resolution** | `--body` / `--body-file <path>` / `--body-file -` priority; none given errors |
| **inbox lists oldest-first with an aggregate** | TOON list + `<N> messages (<U> unread)`; empty is "0 messages" not an error; `--unread`; `--from` |
| **read = peek, does not consume** | body printed; message stays unread; unknown id errors |
| **ack = the consumer** | moves message to read set; already-acked/unknown message errors |
| **owner mailbox from any session** | send-to-standing delivers to the owner inbox; `--owner <handle>` on inbox/read/ack targets a standing inbox; non-standing `--owner` errors; concurrent ack → one wins one errors |
