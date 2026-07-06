---
spec-type: behavioral
concept: [cyberlegion]
---

# wake — doorbell nudge, bounded await, hook surfacing

Wake a peer to a new turn without a shared process: thread-correlated mail (send/reply, thread
filter, delete), a blocking `mail await` that self-caps under a harness tool-timeout, a non-acking
`mail watch` stream, and the two-mode multiplexer probe (`$CYBERLEGION_MUX` fast-path/override else
process-ancestry discovery) that a future gateway (`legion-gateway-legate`, CR-5) will use to pick
between the bounded poll and the multiplexer doorbell. Absorbs the superseded
`cyberfleet-verdict-roundtrip` work (thread-correlated inbox, blocking await, its four resolved
`await` decisions). Authored in `legion-wake` (CR-4).

## Use Cases

**Subject** — correlating a reply to a request, waiting for it without risking a harness kill, and
detecting the session backend a caller is really running inside:

- **Threads correlate a conversation** — `mail send --thread <id> --reply-to <msg-id>` persists both
  fields on the message (already carried by the data model); `mail inbox --thread <id>` filters to
  messages carrying that thread, composing with `--unread`/`--from`; a message with no thread is
  excluded from a `--thread` query.
- **Delete removes mail permanently** — `mail delete <msg-id>` removes a message (unread or already
  acked) from the caller's inbox; unlike ack it does not require the message to still be unread.
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
- **Multiplexer detection is two-mode** — `probeMultiplexer` first trusts `$CYBERLEGION_MUX`
  (`tmux`|`herdr`|`screen`|`none`) outright — this doubles as an override (`=none` forces no-mux even
  inside a real multiplexer). Failing that it walks the process ancestry from `$$` (`ps -o
  ppid=,comm= -p <pid>`) looking for a `tmux`/`tmux: server`, `herdr`, or `screen` ancestor, because
  the tool's own shell may not be the human's pane; `$TMUX`/`$HERDR_ENV` are used only as a
  fast-positive hint the walk falls back to when it is itself inconclusive (e.g. no `ps`), never
  trusted alone. `admin doctor` runs discovery and prints an `export CYBERLEGION_MUX=<m>
  CYBERLEGION_MUX_PANE=<p>` hint so a caller can pin the fast-path; `session spawn` injects the same
  vars into the spawned child's launch command so it inherits the fast-path instead of re-discovering.
- **selectWakePath is a pure decision helper** — given `{harness, mux, observable?,
  dedicatedListener?}` it returns the wake-matrix path a gateway would drive a turn through: the
  portable default is `A-loop` (bounded await); Claude Code with an observable background task
  prefers `A-prime`; a live foreign session behind a verified mux prefers `B`; `B` is never returned
  when `mux.mux === 'none'`. It does no I/O — the gateway (CR-5) composes it with the real `mail
  await`/`session nudge` primitives.

**Non-goals** — the gateway/Legate routing brain that actually calls `selectWakePath` and drives a
turn (`legion-gateway-legate`, CR-5); own-the-PTY (path C) and `/loop`-style external re-invocation
(path D), both dropped from the shipped matrix; the multiplexer doorbell itself (`session nudge`,
already shipped in `session/`) and hook surfacing at a turn boundary (path E, already shipped in
`surfacing/`) — this node adds the mux probe and the decision helper that route to them, not the
primitives themselves.

Every scenario in [`wake.feature`](./wake.feature) maps to one of these behaviors:

| Behavior | What it covers |
|---|---|
| **threads correlate a conversation** | send --thread/--reply-to persistence; inbox --thread filter + composition; threadless exclusion |
| **delete removes mail permanently** | mail delete on unread and already-acked messages |
| **await blocks then reads** | matched (print + ack); waiting (clean max-wait sentinel, re-arm); timed-out (non-zero) |
| **watch streams without consuming** | new-message-only streaming; no ack; --thread/--from filters |
| **multiplexer detection is two-mode** | $CYBERLEGION_MUX fast-path + override; ancestry walk; hint fallback; doctor hint; spawn propagation |
| **selectWakePath is a pure decision helper** | portable default; Claude+observable; live session+mux; never B without mux |
