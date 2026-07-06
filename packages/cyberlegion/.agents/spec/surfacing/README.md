---
spec-type: behavioral
concept: [cyberlegion]
---

# surfacing — inject unread mail into a session across harnesses

`mail hook --event SessionStart|PostToolUse` emits the harness hook payload that injects a spawned
unit's brief and its unread mail into a session, and `admin install` wires that hook into a
project's harness config. Migrated from cyberfleet's `surfacing` node in `legion-extract-core`
(CR-2).

## Use Cases

**Subject** — surfacing a peer's pending brief and unread mail into its own next turn via the
harness's own hook mechanism, and wiring that hook up in the first place:

- **mail hook emits the harness injection payload for unread mail (and a first-run brief)** —
  `mail hook --event <SessionStart|PostToolUse>` resolves the calling agent's own identity, then:
  - on the agent's first hook call while its status is still `spawning`, reads its brief file and
    includes it (`## Your brief`) in the injected context, then flips its status to `active` so later
    calls never re-inject the brief;
  - includes every currently-unread message (`## Unread mail (<N>)`) with sender, subject, body, and
    id;
  - emits the combined payload as the harness's `hookSpecificOutput` shape (raw JSON on stdout, not
    TOON — this command is consumed by the harness, not a human) whenever there is a brief and/or
    unread mail to inject.
- **The dedicated hook command is used, not a generic exec** — the injection payload is produced only
  by `mail hook`; no other CLI path emits `hookSpecificOutput`.
- **An unregistered caller injects nothing rather than erroring** — when the calling session has no
  resolvable self id, `mail hook` prints nothing and exits 0; it never fails the harness turn.
- **No unread mail and no pending brief injects nothing** — a registered, active caller with an empty
  inbox and no brief pending produces no stdout output at all, still exit 0.
- **An unsupported --event is rejected** — only `SessionStart` and `PostToolUse` are recognized;
  anything else throws naming the two supported values.
- **install wires the hook per harness, idempotently, event-scoped by vendor support** — `admin
  install --agent <harness> --dir <path>` registers `cyberlegion mail hook --event <event>` into that
  harness's own hook config file (`.claude/settings.json`, `.cursor/hooks.json`,
  `.codex/hooks.json`). `SessionStart` is wired for every harness (claude, cursor, codex);
  `PostToolUse` is wired only where the harness supports it (claude and codex — cursor has no
  PostToolUse hook). Running install again for the same harness does not duplicate the entry
  (`already present` rather than a second registration).

**Non-goals** — the mail primitives themselves (send/inbox/read/ack, `mail/`), the doorbell nudge
(`session/`), thread correlation and the bounded `mail await`/`watch` (`wake/`) — this node only
covers the hook payload and its installation.

Every scenario in [`surfacing.feature`](./surfacing.feature) maps to one of these behaviors:

| Behavior | What it covers |
|---|---|
| **hook emits brief + unread mail** | first-run brief inject + status flip; unread mail listing every call |
| **dedicated hook command** | the injection payload is produced only by `mail hook` |
| **unregistered caller injects nothing** | no self id → nothing printed, exit 0 |
| **no unread + no brief injects nothing** | empty payload → nothing printed |
| **unsupported --event rejected** | only SessionStart/PostToolUse accepted |
| **install wires per-harness, idempotently** | SessionStart for all three; PostToolUse only where supported; re-run does not duplicate |
