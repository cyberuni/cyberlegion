---
'cyberlegion': patch
---

The `manage-inbox` skill no longer guesses which owner mailbox to use. If `CYBERLEGION_OWNER` is unset and more than one standing owner exists, it stops without running any mail command, lists every standing handle, and asks you to set `CYBERLEGION_OWNER`. If `CYBERLEGION_OWNER` names a handle that is not a standing owner, it reports the error instead of switching to another owner.
