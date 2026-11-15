---
"cyberlegion": patch
---

A session herdr resumes after a device shutdown keeps its unit and reaches its own mail. A resume gives every pane a new terminal id and may hand out new pane ids, so the pane lookup no longer found the unit. The caller's harness conversation, `$CLAUDE_CODE_SESSION_ID` or herdr's `agent_session` for the calling pane, now finds it: `register` and every command's `touch` record that conversation on the unit, a session found by it takes the calling pane back and is active again, and `unit register` in such a session rebinds the existing unit instead of minting one. `unit register` now says on stderr when it mints a new unit. A herdr pane resumed under its old pane id also finds its unit when no conversation is known: a pointer whose unit's terminal herdr lists nowhere is read as a resume, not a move, and `touch` records the new terminal id.
