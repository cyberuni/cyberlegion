---
spec-type: behavioral
concept: [cyberlegion]
---

# identity — self-identify and discover peers

Register this session, recover its own id, and list addressable peers over the global hub (the
`Store`). Migrated from cyberfleet's `identity` node in `legion-extract-core` (CR-2); authored to a
behavioral spec + suite here.

## Use Cases

**Subject** — one session recording who and where it is, recovering that identity on later calls
without being told it, and discovering its live peers:

- **Register records who and where** — `identity register [--handle <name>] [--harness <h>]` writes
  an agent record (id, handle, harness, cwd, worktree, a pane locator tagged with its multiplexer —
  tmux or herdr — status, timestamps) into the hub and, inside any multiplexer pane, a pane→id
  pointer; it stamps the hub root with the tracked `config.json` marker on first use. It is idempotent
  per pane: registering again from the same pane keeps the same id and refreshes the record rather
  than minting a second identity. It fails cleanly (throws, writes no partial record) when the hub
  root cannot be written.
- **whoami prints this session's own identity** — resolves the caller's own id (see self-identity
  recovery below) and prints its record; errors when the session has no identity yet or when a
  resolved self id has no backing record.
- **who lists the addressable peers** — `identity who [--all]` lists every registered agent as a
  TOON list (`agents[N]{id,handle,harness,status}:`) plus a `<N> agents` aggregate line, exit 0 even
  when the registry is empty (`0 agents`, never an error); by default agents with `status: exited`
  are filtered out, `--all` includes them. A top-level `who` command is a plain alias of `identity
  who`.
- **Bare invocation is a content-first status** — `cyberlegion` with no subcommand prints a compact
  status (`self · harness · unread · units`) of this session's own identity, its unread count, and
  how many units are live; exit 0 even when unregistered (`self: -`, with a register next-step) —
  never help-and-error (AXI #8 content-first).
- **prune marks dead agents exited** — `identity prune` scans every non-exited agent and flips
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
- **Every call touches last-seen** — `who`, `prune`, and every mail/session command that resolves the
  caller's own identity refreshes that agent's `lastSeen` to now as a side effect (`touch`), so a live
  but otherwise-idle session never goes stale under `prune`. `touch` is best-effort: a no-op, never
  throwing, when the caller isn't registered.
- **A standing identity is a session-independent, prune-exempt owner inbox** — `identity owner
  --handle <name>` mints a durable record for a human/owner principal so a frameless agent (a
  cron-started session with no parent frame) can `mail send --to <owner>` and exit. A standing record
  carries `kind: standing`, an id **derived from the handle** (stable across calls, distinct from a
  random session id and from any pane pointer), and **no** tmux pane — it is not pane-indexed and
  `resolveSelfId` never resolves to it. `identity owner` is idempotent per handle (same id, refresh),
  and warns when a live session already claims that handle. `prune` **never** marks a standing record
  exited (it has no pane and is exempt from the staleness window); `who` lists it alongside sessions.
  When a handle is shared by a live session and a standing record, recipient resolution prefers the
  **standing** record so an owner report never lands in a dying session's inbox. `AgentRecord.kind` is
  optional and absent ⇒ `session`, so every record written before the field existed is a session (no
  migration). Registration never happens implicitly — sending to an unknown recipient still throws
  (fail-loud); it does not auto-create an owner. Bare `identity owner` (no `--handle`) lists the
  registered standing records only, without any session agents.
- **The main pane is the standing owner's live presence** — `identity bind-main` records the caller's
  current multiplexer pane as the hub's single **main pane**: the one session `surfacing/` treats as
  the standing owner's live presence, where owner mail surfaces. It is a hub-level singleton keyed by
  the pane id, independent of any agent record; binding from a different pane **moves** it (last bind
  wins, still exactly one). It throws when the caller is in no multiplexer pane — there is nothing to
  bind. `identity bind-main --clear` removes the binding (a no-op, never an error, when none is bound),
  and `identity main` prints the bound pane or a definitive "none". Binding a main pane neither creates
  nor requires a standing owner record: the durable inbox (`identity owner`) and where it surfaces
  (`bind-main`) are minted independently.

**Non-goals** — sending/reading mail (`mail/`), spawning/closing/nudging a peer session (`session/`),
hook-based injection of mail into a harness turn (`surfacing/`), thread correlation and the bounded
`mail await`/`watch` (`wake/`) — this node only owns identity: register, recover, discover, prune.

Every scenario in [`identity.feature`](./identity.feature) maps to one of these behaviors:

| Behavior | What it covers |
|---|---|
| **register records who and where** | writes record + pane pointer; hub marker stamped; idempotent per pane; fails cleanly when unwritable |
| **whoami** | prints own record; errors when unregistered or record missing |
| **who lists peers** | TOON list + aggregate; empty is "0 agents" not an error; `--all` includes exited; top-level alias |
| **bare status (AXI #8)** | no-subcommand prints compact self+harness+unread+live-units; exit 0 unregistered with a register next-step, never help+error |
| **prune** | marks dead-pane/stale agents exited; liveness checked against the pane's own multiplexer (tmux or herdr); returns only changed agents |
| **self-identity recovery** | pane pointer first, resolving "my pane" mux-agnostically (tmux `$TMUX_PANE` or herdr `$HERDR_PANE_ID`, plus the `$CYBERLEGION_MUX_PANE` fast-path); `$CYBERLEGION_AGENT_ID` only when in no multiplexer pane; unmapped pane doesn't fall through; no shared `self` file |
| **harness detection** | `--harness` override + validation; env-var probes; tmux pane-command probe; undetectable requires `--harness` |
| **last-seen touch** | refreshed on every identity-resolving call; best-effort no-op when unregistered |
| **standing identity** | `identity owner` mints a handle-keyed, pane-less `kind: standing` record; idempotent; prune-exempt; listed by `who`; standing-precedence on handle collision; absent `kind` ⇒ session (no migration) |
| **main pane** | `bind-main` records the caller's pane as the hub's single owner-presence pane (moves on rebind, throws in no pane); `--clear` unbinds (no-op when unbound); `main` shows the pane or "none"; independent of any standing owner |
