# manage-inbox

The human's surface for the **owner mailbox** — the durable, session-independent inbox where
frameless (cron-started, no-parent-frame) agents push their reports via `relay-governance`.

User-facing. Triggers on "check my inbox", "any reports for me", "read that report", "ack that",
"clear my owner inbox", or when a surfaced owner-mail doorbell needs acting on. Wraps the
`cyberlegion` CLI's owner-scoped mail commands (`mail inbox/read/ack --owner <handle>`) so a human
roaming across sessions manages the one owner mailbox from anywhere.

Read is a deliberate `mail ack --owner` — surfacing shows a report inline but is never a read
receipt. See `SKILL.md` for the full flow (resolve owner → list → read → ack → reply).
