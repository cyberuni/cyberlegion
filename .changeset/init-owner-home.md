---
'cyberlegion': minor
---

`init-cyberlegion` now offers the `legate` owner a home when it mints it. It first explains the presence: `unit claim legate` makes a live session the one that gets the owner's mail, until another session claims it, `--clear` unbinds it, or that session exits. A home is the fallback when nobody holds the presence, and once set it is used instead of ringing the attached pane. Naming a folder registers it with `--home` and one launch (`--harness` or `--agent`); naming none mints the owner bare, as before. An owner that already exists is offered to add a home or drop it with `--clear-home`, without the bind being asked again. With no multiplexer, no home is offered.
