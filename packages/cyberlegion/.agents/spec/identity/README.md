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
  an agent record (id, handle, harness, cwd, worktree, tmux pane/window/session, status, timestamps)
  into the hub and, inside tmux, a pane→id pointer; it stamps the hub root with the tracked
  `config.json` marker on first use. It is idempotent per pane: registering again from the same pane
  keeps the same id and refreshes the record rather than minting a second identity. It fails cleanly
  (throws, writes no partial record) when the hub root cannot be written.
- **whoami prints this session's own identity** — resolves the caller's own id (see self-identity
  recovery below) and prints its record; errors when the session has no identity yet or when a
  resolved self id has no backing record.
- **who lists the addressable peers** — `identity who [--all]` lists every registered agent as a
  TOON list (`agents[N]{id,handle,harness,status}:`) plus a `<N> agents` aggregate line, exit 0 even
  when the registry is empty (`0 agents`, never an error); by default agents with `status: exited`
  are filtered out, `--all` includes them. A top-level `who` command is a plain alias of `identity
  who`.
- **prune marks dead agents exited** — `identity prune` scans every non-exited agent and flips
  `status` to `exited` when its tmux pane is gone (checked via `tmux has-session`/`list-panes`) or its
  `lastSeen` is older than the staleness window (15 minutes); it returns only the agents it changed,
  as a TOON list plus a `<N> pruned` aggregate.
- **Self-identity recovery has one source of truth per context, no shared file** — `resolveSelfId`
  first tries the pane-keyed pointer when `$TMUX_PANE` is set (an unmapped pane resolves to
  `undefined`; it does NOT fall back further in that case); only when there is no `$TMUX_PANE` at all
  does it fall back to `$CYBERLEGION_AGENT_ID`. There is no shared bare `self` file — self-id is
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

**Non-goals** — sending/reading mail (`mail/`), spawning/closing/nudging a peer session (`session/`),
hook-based injection of mail into a harness turn (`surfacing/`), thread correlation and the bounded
`mail await`/`watch` (`wake/`) — this node only owns identity: register, recover, discover, prune.

Every scenario in [`identity.feature`](./identity.feature) maps to one of these behaviors:

| Behavior | What it covers |
|---|---|
| **register records who and where** | writes record + pane pointer; hub marker stamped; idempotent per pane; fails cleanly when unwritable |
| **whoami** | prints own record; errors when unregistered or record missing |
| **who lists peers** | TOON list + aggregate; empty is "0 agents" not an error; `--all` includes exited; top-level alias |
| **prune** | marks dead-pane/stale agents exited; returns only changed agents |
| **self-identity recovery** | pane pointer first; `$CYBERLEGION_AGENT_ID` only absent `$TMUX_PANE`; unmapped pane doesn't fall through; no shared `self` file |
| **harness detection** | `--harness` override + validation; env-var probes; tmux pane-command probe; undetectable requires `--harness` |
| **last-seen touch** | refreshed on every identity-resolving call; best-effort no-op when unregistered |
