# wake — doorbell nudge, bounded await, hook surfacing

Wake a peer to a new turn: **B** the multiplexer doorbell (`session nudge` = send-keys, needs an
ancestry-verified mux), **A-loop** the bounded `mail await` (poll under the cache TTL, clean sentinel),
**E** hook surfacing at a turn boundary. Also the two-mode mux probe (fast-path `$CYBERLEGION_MUX` else
ancestry discovery). Authored in `legion-wake` (CR-4).

> Scaffold placeholder.
