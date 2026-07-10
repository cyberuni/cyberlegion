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
| [`core/`](./core/README.md) | plain send/inbox/read/ack/delete |
| [`wait/`](./wait/README.md) | thread correlation, bounded await, watch |
| [`surface/`](./surface/README.md) | hook injection payload + owner-mail surfacing gate |

**Non-goals** — the unit registry and lifecycle (`unit/`), backend selection and placement (`mux/`),
the human's read-pane pointer (`attach/`), the per-harness installer (pending dedup into `init/`, see
[`mail/surface`](./surface/README.md)'s TODO).
