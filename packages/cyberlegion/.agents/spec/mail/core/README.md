---
spec-type: behavioral
concept: [cyberlegion]
---

# mail core — durable inter-agent messaging

Send, list, and read/ack/delete durable mail over the file queue (the `Store`). Migrated CR-2 from
`mail/mail.feature` (send/inbox/read/ack, unchanged) plus `wake/wake.feature`'s `mail delete`
scenarios (`cyberlegion-cli-realign`, ADR-0024): oversized `mail/` (62 scenarios) sub-split into
`core`/`wait`/`surface`, each a real mail sub-command group rather than a `concept:` tag.

## Use Cases

**Subject** — durably delivering a message to a peer's inbox and letting that peer list, peek at,
consume, or permanently remove it, without losing or duplicating anything:

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
- **delete removes mail permanently** — `mail delete <msg-id>` removes a message (unread or already
  acked) from the caller's inbox; unlike `ack` it does not require the message to still be unread. An
  unknown message id errors rather than silently succeeding.
- **The standing owner mailbox is readable and ackable from any session** — `mail send --to <owner>`
  resolves the standing record (standing-precedence, see `unit/registry`) and delivers into the owner
  inbox. `mail inbox`, `mail read`, and `mail ack` take an `--owner <handle>` selector that targets a
  **standing** record's inbox instead of the caller's own — so a human roaming across sessions manages
  the one hub-level owner mailbox from wherever they are. `--owner` on a handle that is **not** a
  standing record errors (it never reads a session's inbox as an owner mailbox). Read still peeks and
  `ack` is still the only read-state change; two concurrent `mail ack --owner` of the same message
  resolve to exactly one success and one error (the loser throws on an already-acked message), so no
  report is double-consumed or lost.

- **The Bunker is the human's report-up owner inbox (`mail bunker`)** — `mail bunker` is a memorable
  path to the standing owner inbox, named for the Operator/dispatcher persona: sugar over `inbox
  --owner`, so `mail bunker` / `mail bunker read <id>` / `mail bunker ack <id>` operate the Bunker the
  same way `--owner` does. It resolves the standing owner under handle **`bunker`**, falling back to
  the legacy **`legate`** handle when no `bunker` exists (back-compat for pre-rename bindings), and
  errors naming how to mint one when neither is present. The `--owner <handle>` mechanism itself is
  **unchanged and handle-generic** — the rename adds the Bunker path and removes nothing, so any
  existing owner handle keeps resolving.

**Non-goals** — thread correlation (`send --thread/--reply-to`, `inbox --thread`), `mail await`, and
`mail watch` — all spec'd in [`mail/wait`](../wait/README.md); the hook injection payload and
owner-mail surfacing gate — spec'd in [`mail/surface`](../surface/README.md); waking the recipient on
delivery (the push-side doorbell) — spec'd in [`mail/doorbell`](../doorbell/README.md); this node is
plain send/inbox/read/ack/delete plus the Bunker owner-inbox path only.

Every scenario in [`core.feature`](./core.feature) maps to one of these behaviors:

| Behavior | What it covers |
|---|---|
| **send is collision-free and time-ordered** | one message per send; `<epochMs>-<hex>` id; oldest-first sort; unknown recipient errors with no partial write; addressable by handle or id |
| **body resolution** | `--body` / `--body-file <path>` / `--body-file -` priority; none given errors |
| **inbox lists oldest-first with an aggregate** | TOON list + `<N> messages (<U> unread)`; empty is "0 messages" not an error; `--unread`; `--from` |
| **read = peek, does not consume** | body printed; message stays unread; unknown id errors |
| **ack = the consumer** | moves message to read set; already-acked/unknown message errors |
| **delete removes mail permanently** | unread or already-acked messages; unknown id errors |
| **owner mailbox from any session** | send-to-standing delivers to the owner inbox; `--owner <handle>` on inbox/read/ack targets a standing inbox; non-standing `--owner` errors; concurrent ack → one wins one errors |
| **the Bunker owner-inbox path** | `mail bunker[ read/ack]` targets the standing owner under `bunker`, falling back to legacy `legate`; errors naming how to mint one when neither exists; `--owner` stays handle-generic (rename adds, removes nothing) |
