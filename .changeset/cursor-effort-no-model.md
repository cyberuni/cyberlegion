---
'cyberlegion': patch
---

A cursor spawn with an effort but no model no longer fails. `cursor-agent` accepts no effort on its default model, so the spawn launches at cursor's default without the effort, warns on stderr, and reports the effort as `<level> (not applied)`.
