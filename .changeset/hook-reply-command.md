---
"cyberlegion": minor
---

The session-start mail hook now ends its payload with one line naming the reply command, `cyberlegion mail send --to <handle> --thread <id> --subject … --body …`, and telling the reader never to use its harness's own messaging tool, which cannot reach cyberlegion handles. A spawned unit gets the line even with nothing unread. Each surfaced message line also names its thread when it has one.
