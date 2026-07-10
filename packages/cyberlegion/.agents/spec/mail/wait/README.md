---
spec-type: behavioral
concept: [cyberlegion]
---

# mail wait — thread correlation, bounded await, and watch

Correlate a reply to a request, wait for it without risking a harness kill, and stream new mail
without consuming it. Migrated CR-2 from `wake/wake.feature`'s thread/await/watch scenarios
(`cyberlegion-cli-realign`, ADR-0024): oversized `mail/` sub-split into `core`/`wait`/`surface`; the
former `wake/` concept-folder dissolves — `mail wait` is a real mail sub-command group, correctly
subordinate to `mail` instead of a top-level sibling.

## Use Cases

**Subject** — correlating a reply to a request and waiting for it without risking a harness kill:

- **Threads correlate a conversation** — `mail send --thread <id> --reply-to <msg-id>` persists both
  fields on the message (already carried by the data model); `mail inbox --thread <id>` filters to
  messages carrying that thread, composing with `--unread`/`--from`; a message with no thread is
  excluded from a `--thread` query.
- **Await blocks then reads, with three unambiguous outcomes** — `mail await --thread <id> [--from]
  [--timeout <ms>] [--max-wait <s>]` polls the caller's UNREAD inbox on a fixed ~1s internal
  interval. On a match it prints the body and acks it (block-then-read: each await consumes exactly
  its round). Three outcomes, never conflated:
  - `matched` — exit 0, body printed, message acked.
  - `waiting` — exit 0, nothing on stdout, a stderr sentinel — this call's internal poll cycle hit
    its `--max-wait` cap (default 240s, always well under a harness tool-timeout SIGKILL) with no
    match yet; the caller re-arms by calling `await` again. This is NOT giving up.
  - `timed-out` — exit non-zero, nothing on stdout, a clear stderr message — the overall `--timeout`
    (default 600_000ms / 600s; `0` = wait forever) elapsed across re-arms with no match.
- **Watch streams without consuming** — `mail watch [--thread <id>] [--from <h>]` is a continuous
  foreground observer: it prints each NEW matching message as it arrives and never acks, so the
  caller's later `mail inbox`/`mail await` still sees it.

**Non-goals** — plain send/inbox/read/ack/delete (`mail/core`); the hook injection payload and
owner-mail surfacing gate (`mail/surface`); the multiplexer probe, which lives in `mux/` as a real
architectural layer rather than a mail sub-command (the `selectWakePath` wake-matrix decision it once
sat beside was dissolved out of the CLI to the Legate plugin's routing governance in CR-4); the
gateway/Legate routing brain that actually calls these primitives to drive a turn
(`legion-gateway-legate`, CR-5).

Every scenario in [`wait.feature`](./wait.feature) maps to one of these behaviors:

| Behavior | What it covers |
|---|---|
| **threads correlate a conversation** | send --thread/--reply-to persistence; inbox --thread filter + composition; threadless exclusion |
| **await blocks then reads** | matched (print + ack); waiting (clean max-wait sentinel, re-arm); timed-out (non-zero) |
| **watch streams without consuming** | new-message-only streaming; no ack; --thread/--from filters |
