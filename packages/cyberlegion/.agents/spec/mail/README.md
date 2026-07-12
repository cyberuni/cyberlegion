---
concept: [cyberlegion]
---

# mail — durable inter-agent messaging

`mail` is the store and the universal return channel. It carries no `.feature` of its own: CR-2
(`cyberlegion-cli-realign`, ADR-0024) sub-split the oversized single `mail/mail.feature` (which had
also absorbed the former `wake/` and `surfacing/` concept-folders) into three command-axis
sub-nodes, each a real mail sub-command group:

| Node | Concern |
|---|---|
| [`core/`](./core/README.md) | plain send/inbox/read/ack/delete + the Bunker owner-inbox path (`mail bunker`) |
| [`wait/`](./wait/README.md) | thread correlation, bounded await, watch |
| [`surface/`](./surface/README.md) | hook injection payload + owner-mail surfacing gate (the pull side) |
| [`doorbell/`](./doorbell/README.md) | wake the recipient on delivery — the push side: nudge a peer's pane, notify the Bunker's bound main pane, best-effort/never fails the send |

**Non-goals** — the unit registry and lifecycle (`unit/`), backend selection and placement (`mux/`),
the human's read-pane pointer (`attach/`), the per-harness installer (pending dedup into `init/`, see
[`mail/surface`](./surface/README.md)'s TODO).
