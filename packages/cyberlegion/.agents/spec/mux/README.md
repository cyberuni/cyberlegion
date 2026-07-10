---
spec-type: behavioral
concept: [cyberlegion]
---

# mux — the unit-agnostic pane abstraction

The multiplexer layer (the `console/` code) the legion depends on one-way, per ADR-0024/ADR-0021:
which session backend (tmux or herdr) is available, where a new pane opens, and how a caller detects
the multiplexer it is really running inside. Migrated CR-2 from `session/`'s backend-select and
placement scenarios and from `wake/`'s multiplexer-probe and `selectWakePath` scenarios
(`cyberlegion-cli-realign`, ADR-0024); a real architectural layer, not a command noun, so it earns its
own node per the decision.

## Use Cases

**Subject** — a genuine dependency boundary: detecting and selecting the pane backend a unit's
session opens through, independent of any unit's identity or lifecycle:

- **The session backend is selected by environment** — tmux when `$TMUX` is set, herdr when
  `$HERDR_ENV` is set and `$TMUX` is not; an environment with neither throws asking for one.
- **Placement defaults to pane:right** — `--at pane:right|pane:down|tab|window|workspace` chooses
  where the new session opens; omitting it defaults to `pane:right`.
- **Multiplexer detection is two-mode** — `probeMultiplexer` first trusts `$CYBERLEGION_MUX`
  (`tmux`|`herdr`|`screen`|`none`) outright — this doubles as an override (`=none` forces no-mux even
  inside a real multiplexer). Failing that it walks the process ancestry from `$$` looking for a
  `tmux`/`tmux: server`, `herdr`, or `screen` ancestor; `$TMUX`/`$HERDR_ENV` are used only as a
  fast-positive hint the walk falls back to when it is itself inconclusive, never trusted alone.
  `mux doctor` runs discovery and prints an `export CYBERLEGION_MUX=<m> CYBERLEGION_MUX_PANE=<p>`
  hint so a caller can pin the fast-path; `unit spawn` injects the same vars into the spawned
  child's launch command so it inherits the fast-path instead of re-discovering.
- **selectWakePath is a pure decision helper** — given `{harness, mux, observable?,
  dedicatedListener?}` it returns the wake-matrix path a gateway would drive a turn through: the
  portable default is `A-loop` (bounded await); Claude Code with an observable background task
  prefers `A-prime`; a live foreign session behind a verified mux prefers `B`; `B` is never returned
  when `mux.mux === 'none'`. It does no I/O. **Deprecated (CR-4)**: this decision helper is pure
  routing and is expected to move to the Legate plugin alongside `dispatch` when routing leaves the
  CLI; parked here for CR-2 as the least-disruptive placement (migration-map.md judgment call #3).

**Non-goals** — the unit registry and lifecycle that use the selected backend (`unit/`); the
gateway/Legate routing brain that actually calls `selectWakePath` and drives a turn
(`legion-gateway-legate`, CR-5); the mail primitives and hook surfacing that ride on top of a pane
once opened (`mail/`) — this node owns only backend selection, placement, and multiplexer detection.

Every scenario in [`mux.feature`](./mux.feature) maps to one of these behaviors:

| Behavior | What it covers |
|---|---|
| **backend selected by environment** | tmux vs herdr selection; neither present errors |
| **placement** | `--at` choices; default pane:right |
| **multiplexer detection is two-mode** | `$CYBERLEGION_MUX` fast-path + override; ancestry walk; hint fallback; `mux doctor` hint; `unit spawn` propagation |
| **selectWakePath is a pure decision helper** | portable default; Claude+observable; live session+mux; never B without mux — DEPRECATED(cr-4), moves to the Legate plugin |
| **mux mode** | reports the detected session backend; "none" (exit 0) when no adapter is selectable |
