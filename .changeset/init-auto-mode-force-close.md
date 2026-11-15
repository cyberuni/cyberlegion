---
'cyberlegion': minor
---

Add `init --allow-force-close` and `init --mail-environment`. They write Claude Code auto-mode entries in the user settings: a rule that allows `unit close <id> --force` only when the user approved discarding that unit's work in the same session, and a note that `mail send` is local agent-to-agent messaging. `mux doctor` and `init` report both as `forceCloseRule` and `mailEnvironment`. `init --allow-cli` now also covers the `node …/cyberlegion.mjs` and pinned `npx cyberlegion@…` forms, and every settings write keeps the file's indentation.
