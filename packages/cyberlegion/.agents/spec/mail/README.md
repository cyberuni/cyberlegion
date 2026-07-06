# mail — durable inter-agent messaging

Send, list, read/ack, and delete durable mail over the file queue (the `Store`). Migrated from
cyberfleet's `messaging` node in `legion-extract-core` (CR-2); send/inbox/read/ack authored to a
behavioral spec + suite there. Thread correlation (`send --thread/--reply-to`, `inbox --thread`),
`mail delete`, the blocking `mail await`, and `mail watch` are delivered in `legion-wake` (CR-4,
absorbing the `cyberfleet-verdict-roundtrip` work) and specified in
[`wake/wake.feature`](../wake/wake.feature) rather than here, since they are wake-shaped behaviors
layered on top of this node's plain send/inbox/read/ack.

> Scaffold placeholder — this node's own send/inbox/read/ack behavioral spec + suite is still owed
> (tracked separately from wake).
