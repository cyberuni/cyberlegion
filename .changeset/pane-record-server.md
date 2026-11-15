---
"cyberlegion": minor
---

A unit's pane record now names the multiplexer server its pane lives on (`pane.server`) and that server's session name (`pane.session`). For herdr the server is the session's socket (`$HERDR_SOCKET_PATH`) and the session is the herdr session's name. For tmux the server is the tmux socket and the session is the tmux session that holds the pane. `unit register`, `unit spawn`, `unit restart`, and `unit rebind` write them, and a unit recorded before they existed gets them on its next command. `unit who --same-server` lists only the units on the caller's own server, the same herdr session or tmux server, and leaves out any unit whose record names another server or none. A pane id is unique only within one server, so a sweep can now act on its own units without touching another session's.
