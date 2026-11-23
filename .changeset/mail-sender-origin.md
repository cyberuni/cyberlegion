---
"cyberlegion": minor
---

Each mail message now records where its sender was running at send time: `origin.pane`, `origin.repo`, `origin.worktree`, and `origin.branch`, copied from the sender's unit record so they outlive it being pruned. `mail send --blocked` marks a sender that is waiting on the reader's answer. `mail inbox` gains `blocked` and `origin` columns, and the session-start mail hook marks blocked senders and names each message's origin. All new fields are optional, so older messages read as before.
