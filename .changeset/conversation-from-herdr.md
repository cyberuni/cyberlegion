---
"cyberlegion": minor
---

`unit who` fills in a unit's harness conversation id from herdr when its SessionStart hook could not record one. For a caller in a herdr pane it reads `herdr pane list` once and gives every live herdr unit with no `conversation` the `agent_session` herdr lists for its terminal, the id herdr resumes the pane with. A unit in an environment that prohibits hooks now has a findable transcript. A unit is matched by its terminal id only, never by its pane id, and a conversation a unit already carries is kept. `conversation` stays optional: absent means unknown.
