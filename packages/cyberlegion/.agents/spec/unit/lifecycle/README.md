---
spec-type: behavioral
concept: [cyberlegion]
---

# unit lifecycle — warm peer session lifecycle over a multiplexer

Spawn, scrape, focus, nudge, **clear**, and close a warm interactive peer via tmux/herdr. Migrated
CR-2 from `session/` (`cyberlegion-cli-realign`, ADR-0024): the lifecycle half of `unit` —
registration and discovery live in the sibling `unit/registry` node; backend selection and placement
moved to the new `mux/` node (a real architectural layer, not a command noun).

## Use Cases

**Subject** — opening a genuine sibling peer session — in a new git worktree it creates, or in an
existing directory a caller supplies (`--cwd`) — and its session pane, then tearing it back down
cleanly — the deterministic inverse pair:

- **spawn opens a new peer session and registers it as spawning before it starts** — `unit spawn
  --harness <h> --task <text>` (or `--brief-file`) creates a real git worktree distinct from the
  primary checkout, opens a session backend (tmux or herdr, selected by environment — see `mux/`)
  with its cwd set to that worktree, pre-registers the peer (`status: spawning`, `spawnedBy` the
  caller's own id when it has one) and writes its pane pointer and brief file BEFORE the session
  backend actually launches the harness — the peer's own first-turn hook is what flips it to `active`
  (`mail/surface`).
  - **The new worktree is always distinct from the primary checkout** — spawn refuses (throws) a
    `--worktree-path` that resolves onto the primary checkout rather than opening a session there.
  - **Or spawn into an existing directory without a worktree (`--cwd`)** — `unit spawn --cwd <dir>`
    opens the session in a directory that already exists, creating and removing no git worktree; the
    peer is registered with that directory as its cwd and no created worktree. `--cwd` requires the
    directory to already exist (cyberlegion creates no directory), refuses the primary checkout (the
    same guard the created-worktree path enforces), and is mutually exclusive with the
    worktree-creating flags (`--branch` / `--worktree-path`). This is the enabler that lets a caller
    (e.g. the `cyberfleet` fleet layer) own the worktree lifecycle and hand cyberlegion a ready
    directory to run in.
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
  `unit close <ref>` removes the peer's git worktree, tears down its session pane, and reaps its
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
  - **close on a `--cwd` unit removes no worktree** — a unit spawned with `--cwd` has a recorded cwd
    and no created worktree; close tears down its session pane and reaps its record but attempts no
    worktree removal.
- **focus moves input focus to a peer's session** — `unit focus <ref>` resolves the peer (by id,
  handle, or worktree branch/CR ref) to its pane and focuses it via the session adapter.
- **nudge rings a peer's session — a doorbell that carries a message** — `unit nudge <ref>`
  delivers a message as a turn to the peer's pane through the session adapter (a live agent session
  only acts on real input; an empty keystroke is a no-op). The default message points the peer at its
  inbox; `--message <text>` overrides it. The mail the peer already has is the real payload —
  `mail/surface`/`mail/wait` read it on that turn.
- **read scrapes a peer's session screen** — `unit read <ref> [--lines <n>]` captures the target
  pane's current output through the session adapter.
- **focus, nudge, and read need a live target — the same fail-loud floor as `clear`** — each first
  resolves the ref to a peer and then to a live pane before touching the session adapter, so both
  error cases fail loud with the adapter untouched: an **unresolvable ref** (no unit addressable by
  that id, handle, or worktree branch/CR ref) throws naming the ref, and a **registered unit with no
  known session pane** throws that the unit has no known session pane. Nothing is focused, delivered,
  or scraped in either case — the guard runs before any adapter call.
- **clear resets a warm peer's context while keeping it warm** — `unit clear <ref>` injects the
  peer's **own harness in-session fresh-context command** into its pane through the session adapter,
  returning the conversation to a cold state **without** tearing down the session, removing the
  worktree, or reaping the registry record — the pane/process stays warm (no cold-start cost), only
  the context goes cold. This is the warm/cold decoupling primitive: warmth is the unit, coldness is
  the context. The command is resolved from a **per-harness reset map** keyed on genuine
  fresh-context semantics, never on the literal word `/clear`: `claude`/`codex`/`copilot` → `/clear`,
  `cursor` → `/new-chat`. A harness whose apparent clear does **not** truly empty the model context
  (e.g. `gemini`, where `/clear` wipes only the terminal screen), or any harness absent from the map,
  **fails loud** naming the harness — never a silent no-op and never a false-friend command that
  leaves stale context behind. Injection is best-effort like `nudge` (the harness owns the actual
  reset); `clear` asserts the command was sent, not that the context is provably empty.

**Non-goals** — the unit registry and self/peer discovery (`unit/registry`), backend selection and
placement (`mux/`), mail send/inbox/read/ack (`mail/`), thread correlation and the bounded `mail
await`/`watch` (`mail/wait`), hook-based mail/brief injection into a harness turn (`mail/surface`) —
this node only owns the session lifecycle (spawn/close/focus/nudge/read/clear) and the worktree it
creates (when it creates one — a `--cwd` spawn opens into a caller-supplied directory and owns no
worktree). `clear` owns only injecting the harness's fresh-context command into the pane — it never
verifies the harness actually emptied its context (best-effort, the harness owns the reset), and the
routing decision to reset a warm unit belongs to the caller (the Legate plugin / an SDD conductor),
not this mechanism.

Every scenario in [`lifecycle.feature`](./lifecycle.feature) maps to one of these behaviors:

| Behavior | What it covers |
|---|---|
| **spawn registers as spawning before it starts** | pre-registration, brief/pane pointer written before launch |
| **worktree distinct from primary** | refuses a `--worktree-path` resolving onto the primary checkout |
| **spawn into an existing dir (`--cwd`)** | creates no worktree; registers the dir as cwd; requires the dir to exist; refuses the primary checkout; mutually exclusive with the worktree flags |
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
| **close on a `--cwd` unit** | tears down the session and reaps; removes no worktree |
| **focus** | move input focus to a peer's pane |
| **nudge** | doorbell that delivers a message as a turn; default points at the inbox, `--message` overrides |
| **read** | scrape a peer's session screen |
| **focus/nudge/read need a live target** | an unresolvable ref or a unit with no known session pane throws before any adapter call — nothing focused/delivered/scraped |
| **clear injects harness reset, keeps pane warm** | sends the harness's own fresh-context command; tears nothing down; record/pane/worktree unchanged |
| **clear resolves the per-harness reset map** | claude/codex/copilot → `/clear`, cursor → `/new-chat` |
| **clear fails loud on a false-friend / unmapped harness** | gemini (`/clear` = screen-only) or any unmapped harness throws; nothing sent |
| **clear needs a live target** | unknown id or no known pane errors, sends nothing |
