# mail — durable inter-agent messaging

Send, list, read/ack, and delete durable mail over the file queue (the `Store`). Thread-correlated
inbox + `send --thread/--reply-to` arrive with `legion-wake` (CR-4, absorbing the verdict-roundtrip
work). Migrated from cyberfleet's `messaging` node in `legion-extract-core` (CR-2).

> Scaffold placeholder.
