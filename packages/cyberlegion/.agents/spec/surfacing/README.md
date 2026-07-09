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
- **A live-pane caller with no identity auto-registers; an unregistered non-pane caller injects
  nothing** — when the calling session has no resolvable self id but is in a live multiplexer pane,
  `mail hook` registers it first (best-effort: the same mux-agnostic `register` the CLI runs, so the
  session's pane resolves to a fresh agent id and later calls recover it) before surfacing. When the
  session has no self id **and** is in no resolvable pane — or when auto-register cannot determine the
  harness — `mail hook` prints nothing and exits 0. Either way it never fails the harness turn.
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
- **Owner mail surfaces into the bound main pane, never into a spawned unit** — beyond the caller's
  own brief and unread mail, `mail hook` also surfaces the **standing owner** inbox's unread mail
  (bodies included) under a distinct owner-mail heading, so a human sees a frameless agent's report
  inline without pulling it manually. A spawned unit (record has a `spawnedBy`) **never** surfaces
  owner mail. Among root sessions (no `spawnedBy`) the gate keys on the hub's **main pane** (`identity
  bind-main`): when a main pane **is** bound, only the session in that pane surfaces owner mail —
  another root pane surfaces none; when **no** main pane is bound, the gate falls back to surfacing in
  **any** root session (the pre-onboarding behavior, so nothing regresses before a pane is bound).
  Surfacing **never acks** — an unread owner message re-surfaces on every hook call until it is
  explicitly acked (`mail ack --owner`), and once acked it no longer surfaces (showing a message is a
  model printing text, not proof a human read it, so read stays a deliberate act). When no standing
  owner record exists at all, `mail hook` surfaces no owner section and still exits 0.
- **An unbound root session gets a session-start setup nudge** — when the caller is a root session (no
  `spawnedBy`) and onboarding is incomplete, `mail hook` appends a best-effort `## Legion setup` line
  pointing at `cyberlegion init`, so a human is prompted to designate this pane as the owner's live
  presence. Incomplete means: **in a multiplexer pane** → no main pane is bound; **in no pane**
  (non-mux) → no standing owner record exists (there is no pane to bind, so a minted owner is the
  completion signal). Binding a main pane (mux) or minting the standing owner (non-mux) silences the
  nudge. A spawned unit never gets it. Computing the gate or the nudge is best-effort — any store error
  is swallowed and the hook still exits 0, never failing the harness turn.

**Non-goals** — the mail primitives themselves (send/inbox/read/ack, `mail/`), the doorbell nudge
(`session/`), thread correlation and the bounded `mail await`/`watch` (`wake/`), minting the standing
owner inbox and binding the main pane (`identity/`), and the auto-detecting onboarding front door
(`init/`) — this node only covers the hook payload, its installation, and the owner-mail/nudge
surfacing gate.

Every scenario in [`surfacing.feature`](./surfacing.feature) maps to one of these behaviors:

| Behavior | What it covers |
|---|---|
| **hook emits brief + unread mail** | first-run brief inject + status flip; unread mail listing every call |
| **dedicated hook command** | the injection payload is produced only by `mail hook` |
| **live-pane caller auto-registers; non-pane caller injects nothing** | no self id but in a live mux pane → best-effort auto-register (pane resolves to a fresh id) then surface; no self id and no pane (or harness undetectable) → nothing printed; either way exit 0, never fails the turn |
| **no unread + no brief injects nothing** | empty payload → nothing printed |
| **unsupported --event rejected** | only SessionStart/PostToolUse accepted |
| **install wires per-harness, idempotently** | SessionStart for all three; PostToolUse only where supported; re-run does not duplicate |
| **owner mail surfaces into the bound main pane** | spawned units never surface; among root sessions, a bound main pane gates surfacing to that one pane, and with none bound it falls back to any root session; bodies under an owner heading; never acks; acked no longer surfaces |
| **session-start setup nudge** | an unbound root session gets a best-effort `## Legion setup` nudge toward `cyberlegion init` (mux: no main pane bound; non-mux: no standing owner); binding/minting silences it; spawned units never get it; best-effort, always exit 0 |
