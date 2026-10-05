---
'cyberlegion': minor
---

A standing owner can now have a home: `unit register --standing --handle <name> --home <dir> (--agent <def> | --harness <h>)`. When mail reaches a standing owner with no live presence, `mail send` spawns a session in the home in its own workspace and binds it as the presence. It accepts the folder's trust prompt and wakes the session to read the owner's inbox. A home outranks the bound main pane. `--clear-home` drops it. A home is validated when it is registered: it must exist, name exactly one launch, and not be a primary checkout. A spawn that cannot happen at delivery is a warning that falls back to the main pane. That includes a sender outside any multiplexer pane, and the warning names `CYBER_MUX` as the way to reach a running one. A re-register of a standing owner now keeps its bound presence instead of dropping it.
