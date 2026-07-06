# dispatch — result-slot primitives

Delegate work and await a verdict. `prep` allocates an id + brief + result slot and returns an envelope
(spawns nothing); `channel` is the one CLI-driven convenience (prep + `session spawn` a peer + await).
The CLI never auto-selects a backend and never invokes a harness subagent tool — routing is the Legate's
(the `cyberlegion` plugin). Authored in `legion-dispatch-primitives` (CR-3).

> Scaffold placeholder.
