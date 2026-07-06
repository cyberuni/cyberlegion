---
spec-type: behavioral
concept: [cyberlegion]
---

# session — warm peer session lifecycle over a multiplexer

Spawn, place (`--at pane/tab/window`), scrape, focus, nudge, and close a warm interactive peer via
tmux/herdr. Migrated from cyberfleet's `spawn` + `decommission` nodes in `legion-extract-core`
(CR-2).

## Use Cases

**Subject** — opening a genuine sibling peer session in its own git worktree and session pane, then
tearing it back down cleanly — the deterministic inverse pair:

- **spawn opens a new peer session and registers it as spawning before it starts** — `session spawn
  --harness <h> --task <text>` (or `--brief-file`) creates a real git worktree distinct from the
  primary checkout, opens a session backend (tmux or herdr, selected by environment) with its cwd set
  to that worktree, pre-registers the peer (`status: spawning`, `spawnedBy` the caller's own id when
  it has one) and writes its pane pointer and brief file BEFORE the session backend actually launches
  the harness — the peer's own first-turn hook is what flips it to `active` (surfacing).
  - **The new worktree is always distinct from the primary checkout** — spawn refuses (throws) a
    `--worktree-path` that resolves onto the primary checkout rather than opening a session there.
  - **The session backend is selected by environment** — tmux when `$TMUX` is set, herdr when
    `$HERDR_ENV` is set and `$TMUX` is not; an environment with neither throws asking for one.
  - **Placement defaults to pane:right** — `--at pane:right|pane:down|tab|window` chooses where the
    new session opens; omitting it defaults to `pane:right`.
  - **The brief is delivered by file, never typed** — the resolved brief text is written to the peer's
    own brief file in the hub, never appended to the typed launch command.
  - **An unmapped harness errors before anything launches** — `--harness` outside the launch map
    (`claude | cursor | codex`) throws naming the launch map, before any worktree/session is opened.
  - **No brief source errors** — neither `--task`, `--task -` (stdin), nor `--brief-file` given
    throws asking for a brief; nothing is spawned.
  - **--agent/--agent-file realizes a resolved def's launch** — when `--agent <name>` or
    `--agent-file <path>` is given, the resolved def's harness/model/instructions compose the launch
    command in place of the harness's bare default binary; an explicit `--harness` still overrides the
    def's own harness tag.
- **close tears down the worktree + session and reaps the state — spawn's deterministic inverse** —
  `session close <ref>` removes the peer's git worktree, tears down its session pane, and reaps its
  registry record, pane pointer, and stored data (brief).
  - **Refuses the primary checkout even with --force** — a unit whose worktree root equals the
    primary checkout is refused; `--force` never overrides this refusal.
  - **Refuses a dirty worktree unless --force** — uncommitted changes in the worktree abort the
    close (record left intact, retryable); `--force` discards them and proceeds.
  - **Completes the reap when the worktree or pane is already gone** — a worktree already absent from
    disk, or a pane the session backend can no longer find, is tolerated; the reap (record, pane
    index, stored data) still completes.
  - **A genuine teardown failure aborts before any reap** — when worktree removal itself fails (not
    "already gone" but a real error), the command aborts and leaves the record intact so the close is
    retryable, never leaving a half-reaped unit.
  - **An unknown id errors** — closing an id with no registered record throws naming it; nothing is
    reaped.
  - **Reaps only the targeted unit's state** — another unit's record, pane pointer, and stored data are
    left untouched.
- **list shows the live peers** — `session list` lists agents whose `status` is not `exited` as a
  TOON list (id, handle, status, pane) with a `<N> sessions` aggregate.
- **focus moves input focus to a peer's session** — `session focus <ref>` resolves the peer (by id,
  handle, or worktree branch/CR ref) to its pane and focuses it via the session adapter.
- **nudge rings a peer's session — a dumb doorbell** — `session nudge <ref>` sends an empty
  keystroke to the peer's pane through the session adapter; it carries no payload itself (the mail is
  the payload — surfacing/wake read it on the peer's next turn).
- **read scrapes a peer's session screen** — `session read <ref> [--lines <n>]` captures the target
  pane's current output through the session adapter.

**Non-goals** — mail send/inbox/read/ack (`mail/`), thread correlation and the bounded `mail
await`/`watch` (`wake/`), hook-based mail/brief injection into a harness turn (`surfacing/`) — this
node only owns the session lifecycle (spawn/close/list/focus/nudge/read) and the worktree it opens.

Every scenario in [`session.feature`](./session.feature) maps to one of these behaviors:

| Behavior | What it covers |
|---|---|
| **spawn registers as spawning before it starts** | pre-registration, brief/pane pointer written before launch |
| **worktree distinct from primary** | refuses a `--worktree-path` resolving onto the primary checkout |
| **backend selected by environment** | tmux vs herdr selection; neither present errors |
| **placement** | `--at` choices; default pane:right |
| **brief delivered by file** | never typed into the launch command |
| **unmapped harness errors** | before any worktree/session opens |
| **no brief source errors** | `--task`/`--task -`/`--brief-file` required |
| **--agent/--agent-file realizes launch** | resolved def composes harness/model/instructions; explicit `--harness` overrides |
| **close tears down + reaps (spawn's inverse)** | worktree + session + registry/pane/data reaped |
| **close refuses primary checkout** | absolute — `--force` never overrides |
| **close refuses dirty worktree** | unless `--force` |
| **close tolerates already-gone worktree/pane** | reap still completes |
| **close aborts on genuine teardown failure** | before any reap; record left intact for retry |
| **close on unknown id errors** | nothing reaped |
| **close reaps only the targeted unit** | other units' state untouched |
| **list** | live (non-exited) peers |
| **focus** | move input focus to a peer's pane |
| **nudge** | doorbell send-keys, no payload |
| **read** | scrape a peer's session screen |
