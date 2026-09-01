---
'cyberlegion': patch
---

Take `cyber-mux` 0.5.0, whose `read` answers with `{ text, truncated? }` instead of a bare
string. `readUnit` still returns the trailing screen as a string, so nothing in this package's
own surface changes — only the shipped code behind it.
