---
spec-type: behavioral
concept: [cyberlegion]
---

# unit registry — register, discover, and prune legion units

Register this session, recover its own id, discover addressable peers over the global hub (the
`Store`), and reap dead ones. Migrated CR-2 from `identity/` (register/whoami/who/prune/self-id/
harness/touch/standing) plus `session/`'s `list` scenario (`cyberlegion-cli-realign`, ADR-0024): the
registry half of `unit` — the instance registry a unit's identity always was.

## Use Cases

**Subject** — one session recording who and where it is, recovering that identity on later calls
without being told it, and discovering its live peers:

- **Register records who and where** — `unit register [--handle <name>] [--harness <h>]` writes an
  agent record (id, handle, harness, cwd, worktree, a pane locator tagged with its multiplexer —
  tmux or herdr — status, timestamps) into the hub and, inside any multiplexer pane, a pane→id
  pointer; it stamps the hub root with the tracked `config.json` marker on first use. It is idempotent
  per pane: registering again from the same pane keeps the same id and refreshes the record rather
  than minting a second identity. It fails cleanly (throws, writes no partial record) when the hub
  root cannot be written.
- **whoami prints this session's own identity** — resolves the caller's own id (see self-identity
  recovery below) and prints its record; errors when the session has no identity yet or when a
  resolved self id has no backing record.
- **who lists the addressable peers** — `unit who [--all]` is the single list command (the old
  `session list` folded in, CR-2 resolution #1): every registered unit as a TOON list
  (`units[N]{id,handle,harness,status,pane}:`) plus a `<N> units` aggregate line, exit 0 even when the
  registry is empty (`0 units`, never an error); by default units with `status: exited` are filtered
  out, `--all` includes them. A top-level `who` command is a plain alias of `unit who`.
- **Bare invocation is a content-first status** — `cyberlegion` with no subcommand prints a compact
  status (`self · harness · unread · units`) of this session's own identity, its unread count, and
  how many units are live; exit 0 even when unregistered (`self: -`, with a register next-step) —
  never help-and-error (AXI #8 content-first).
- **prune marks dead agents exited** — `unit prune` scans every non-exited agent and flips
  `status` to `exited` when its pane is gone or its `lastSeen` is older than the staleness window
  (15 minutes); it returns only the agents it changed, as a TOON list plus a `<N> pruned` aggregate.
  Liveness is checked **against the pane's own multiplexer** — a tmux locator via
  `tmux has-session`/`list-panes`, a herdr locator via a herdr pane-existence query — so a live herdr
  pane is never false-reaped by a tmux check (and vice versa).
- **Self-identity recovery has one source of truth per context, no shared file** — `resolveSelfId`
  first tries the pane-keyed pointer when the session is in a multiplexer pane, resolving "my pane id"
  mux-agnostically through the shared current-pane helper (tmux `$TMUX_PANE` or herdr `$HERDR_PANE_ID`,
  and the `$CYBERLEGION_MUX_PANE` fast-path a spawn propagates); an unmapped pane resolves to
  `undefined` and does NOT fall back further. Only when the session is in **no** multiplexer pane at
  all does it fall back to `$CYBERLEGION_AGENT_ID`. There is no shared bare `self` file — self-id is
  always pane-keyed or explicit via the env var.
- **Harness detection is layered** — `--harness` (explicit) always wins and is validated against
  `claude | cursor | codex`, throwing on anything else; absent that, detection tries harness-specific
  env vars (`CLAUDECODE`/`CLAUDE_CODE_ENTRYPOINT`, any `CURSOR*`/`CODEX*` key) and finally, inside
  tmux, the pane's own running command (`tmux display-message … #{pane_current_command}`); when none
  of these detect anything, `register` throws asking for `--harness` rather than guessing.
- **Every call touches last-seen** — `who`, `prune`, and every mail/unit command that resolves the
  caller's own identity refreshes that agent's `lastSeen` to now as a side effect (`touch`), so a live
  but otherwise-idle session never goes stale under `prune`. `touch` is best-effort: a no-op, never
  throwing, when the caller isn't registered.
- **A standing identity is a session-independent, prune-exempt owner inbox** — `unit register
  --standing --handle <name>` mints a durable record for a human/owner principal so a frameless agent
  (a cron-started session with no parent frame) can `mail send --to <owner>` and exit. A standing
  record carries `kind: standing`, an id **derived from the handle** (stable across calls, distinct
  from a random session id and from any pane pointer), and **no** tmux pane — it is not pane-indexed
  and `resolveSelfId` never resolves to it. `unit register --standing` is idempotent per handle (same
  id, refresh), and warns when a live session already claims that handle. `prune` **never** marks a
  standing record exited (it has no pane and is exempt from the staleness window); `who` lists it
  alongside sessions. When a handle is shared by a live session and a standing record, recipient
  resolution prefers the **standing** record so an owner report never lands in a dying session's
  inbox. `AgentRecord.kind` is optional and absent ⇒ `session`, so every record written before the
  field existed is a session (no migration). Registration never happens implicitly — sending to an
  unknown recipient still throws (fail-loud); it does not auto-create an owner. Bare `unit register
  --standing` (no `--handle`) lists the registered standing records only, without any session agents.

- **reconcile culls records against the live mux, mux-scoped** — `unit who --reconcile` (mirrors
  `--all`, the settled seam that keeps `who` cheap by default) live-probes the current mux's panes via
  the adapter's `listPanes` primitive and marks any non-`standing`, pane-bearing record whose pane is
  absent from that live set as `exited`, returning the changes; `prune` reconcile-culls too. It is
  **mux-scoped** — it enumerates only the multiplexer the caller is currently inside (tmux
  `list-panes -a` or herdr `pane list`) and never declares the *other* mux's records dead, since it
  cannot see them. A `kind: standing` record is never touched. A record whose `pane` is `null` cannot
  be pane-culled by enumeration — it is left to the existing staleness timer. Outside any multiplexer
  pane, reconcile has nothing to enumerate and culls nothing.
- **`listPanes` is the bulk enumeration primitive** — a `SessionAdapter` method returning every live
  pane the backend can currently see (`{ id, mux, harness?, cwd? }`), the counterpart to `paneExists`'s
  single targeted query. herdr's `pane list` reports each pane's running agent; a pane with no agent
  (a bare/scaffold pane) is dropped. tmux's `list-panes -a` reports id + command + cwd; harness is not
  directly knowable from tmux, so it is omitted.

**Non-goals** — sending/reading mail (`mail/`), spawning/closing a peer session (`unit/lifecycle`),
backend selection and placement (`mux/`), hook-based injection of mail into a harness turn
(`mail/surface`), the human's read-pane pointer (`attach/`), adopting a live-but-unregistered pane
(reconcile's adopt half, a separate CR), and exited-record retention/GC (also separate) — this node
only owns the registry: register, recover, discover, prune, and the cull half of reconcile.

Every scenario in [`registry.feature`](./registry.feature) maps to one of these behaviors:

| Behavior | What it covers |
|---|---|
| **register records who and where** | writes record + pane pointer; hub marker stamped; idempotent per pane; fails cleanly when unwritable |
| **whoami** | prints own record; errors when unregistered or record missing |
| **who lists peers** | single list command (folded `session list`): TOON list with a `pane` field; aggregate "N units"; empty is "0 units"; `--all` includes exited; top-level alias |
| **bare status (AXI #8)** | no-subcommand prints compact self+harness+unread+live-units; exit 0 unregistered with a register next-step, never help+error |
| **prune** | marks dead-pane/stale agents exited; liveness checked against the pane's own multiplexer (tmux or herdr); returns only changed agents |
| **self-identity recovery** | pane pointer first, resolving "my pane" mux-agnostically (tmux `$TMUX_PANE` or herdr `$HERDR_PANE_ID`, plus the `$CYBERLEGION_MUX_PANE` fast-path); `$CYBERLEGION_AGENT_ID` only when in no multiplexer pane; unmapped pane doesn't fall through; no shared `self` file |
| **harness detection** | `--harness` override + validation; env-var probes; tmux pane-command probe; undetectable requires `--harness` |
| **last-seen touch** | refreshed on every identity-resolving call; best-effort no-op when unregistered |
| **standing identity** | `unit register --standing` mints a handle-keyed, pane-less `kind: standing` record; idempotent; prune-exempt; listed by `who`; standing-precedence on handle collision; absent `kind` ⇒ session (no migration) |
| **reconcile cull** | `who --reconcile` / `prune` live-probe the current mux via `listPanes` and mark an absent-pane record exited; mux-scoped (never culls the other mux); standing exempt; `pane: null` not pane-culled |
| **listPanes adapter contract** | herdr `pane list` JSON → `{id, mux, harness, cwd}`, drops agentless scaffold panes; tmux `list-panes -a -F` → `{id, mux, cwd}`, no harness |
