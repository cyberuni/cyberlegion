# cyberlegion

## 0.1.0

### Minor Changes

- 667163c: Add a `workspace` value to `session spawn --at` (and `dispatch channel --at`) that opens a genuinely new workspace/session instead of a pane inside the caller's current one. Under herdr this also creates the new worktree via `herdr worktree create`, so it lands properly nested under its source workspace instead of just adding to the caller's own pane count; under tmux it opens a new detached session.
- 2758ea9: Add the owner mailbox read path. `mail hook` now surfaces every standing owner's unread mail
  (with bodies) into a root session's injected context under a distinct `## Owner mail — <handle>
(<N>)` heading — read-only, so a message keeps re-surfacing until explicitly acked; a session
  that was legion-spawned (has `spawnedBy`) never gets an owner section. `mail inbox`, `mail read`,
  and `mail ack` take a new `--owner <handle>` selector that targets a standing owner's mailbox
  instead of the caller's own; `--owner` on a handle that is not a standing record errors rather
  than falling back to reading a session's inbox as an owner mailbox.
- 9e24386: Add `identity owner --handle <name>` to mint a standing, session-independent owner inbox — a durable recipient identity with no live session, tmux pane, or harness. Standing records are exempt from `prune` staleness checks, are listed by `who`, and take precedence over a live session when a handle is shared. Bare `identity owner` lists existing standing records.

### Patch Changes

- 667163c: Fix `session spawn`'s default worktree checkout location: it now lives as a sibling of the primary checkout (`<repo>.worktrees/legion-<id>`) instead of nested inside `<primary>/.agents/cyberlegion/worktrees/`, which polluted `git status` in the primary checkout and confused tooling that walks the tree recursively. The directory name uses the same 6-character id slice the peer's `handle` already defaults to.

## 0.0.1

### Patch Changes

- 7c92d8e: Mark the CLI bin shim as executable so it runs directly after install.
