# init-cyberlegion

The onboarding front door to the Legion — walks a session through getting `cyberlegion` working in
this repo: probe the environment, register the surfacing hook, and (root session only, only on an
explicit yes) allow the `cyberlegion` CLI in Claude Code's permissions and bind this pane as the
durable `legate` owner inbox.

User-facing. Triggers on "set up cyberlegion", "onboard the legion", "register the cyberlegion
surfacing hook", "make this pane my main legion inbox", "get cyberlegion working in this repo". Wraps
`cyberlegion mux doctor` / `init [--allow-cli]` / `unit register --standing` / `attach` — every mechanic is a
CLI call, no filesystem or hub state touched directly.

Distinct from `legate` (spawn/mail/dispatch a peer) and `manage-inbox` (read/ack owner mail once
bound). See `SKILL.md` for the full flow (probe → consent-gated permission rule + register hook →
detect root vs spawned → consent-gated bind).
