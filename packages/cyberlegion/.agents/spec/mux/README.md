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
- **Placement defaults to tab** — `--at pane:right|pane:down|tab|workspace` chooses where the new
  session opens; omitting it defaults to `tab` (a new tab in the caller's current window, opened
  without stealing focus), so a spawned peer never shrinks the caller's pane by splitting it. `tab`
  maps to each backend's native Tab primitive — tmux `new-window`, herdr `tab create` — never a
  split pane.
- **Multiplexer detection is two-mode** — `probeMultiplexer` first trusts `$CYBERLEGION_MUX`
  (`tmux`|`herdr`|`screen`|`none`) outright — this doubles as an override (`=none` forces no-mux even
  inside a real multiplexer). Failing that it walks the process ancestry from `$$` looking for a
  `tmux`/`tmux: server`, `herdr`, or `screen` ancestor; `$TMUX`/`$HERDR_ENV` are used only as a
  fast-positive hint the walk falls back to when it is itself inconclusive, never trusted alone.
  `mux doctor` runs discovery and prints an `export CYBERLEGION_MUX=<m> CYBERLEGION_MUX_PANE=<p>`
  hint so a caller can pin the fast-path; `unit spawn` injects the same vars into the spawned
  child's launch command so it inherits the fast-path instead of re-discovering.
**Non-goals** — the unit registry and lifecycle that use the selected backend (`unit/`); the
wake-matrix routing decision (`selectWakePath` — which wake path a gateway drives a turn through)
that CR-4 moved out of the CLI to the Legate plugin's routing governance, alongside `dispatch`; the
gateway/Legate routing brain that actually calls `selectWakePath` and drives a turn
(`legion-gateway-legate`, CR-5); the mail primitives and hook surfacing that ride on top of a pane
once opened (`mail/`) — this node owns only backend selection, placement, and multiplexer detection.

## Multiplexer concept vocabulary

`--at` names a **placement concept**, not a backend-specific command. Every multiplexer nests the
same four levels — **Session › Workspace › Tab › Pane** — but each calls them something different
(notably: a tmux/screen "Window" is the **Tab** level, not a workspace). The adapter maps the
concept onto whatever the live backend calls it:

| Concept       | tmux    | screen | zellij  | cmux                          | Orca                  | herdr     |
| ------------- | ------- | ------ | ------- | ----------------------------- | --------------------- | --------- |
| **Session**   | Session | Session| Session | App (state saved on restart)  | ----                  | Session   |
| **Workspace** | ----    | ----   | ----    | Window/Workspace              | Worktree (git branch) | Workspace |
| **Tab**       | Window  | Window | Tab     | Vertical Tab (w/ git status)  | Tab                   | Tab       |
| **Pane**      | Pane    | Region | Pane    | Split Pane                    | Pane                  | Pane      |

cyberlegion drives two of these backends (tmux, herdr). `--at` exposes three of the levels —
`pane:right`/`pane:down` (**Pane**), `tab` (**Tab**), `workspace` (**Workspace**); tmux, having no
Workspace level, maps `workspace` onto its next-widest unit, a new **Session**. There is no `window`
value — "window" is tmux's local name for the **Tab** concept, already covered by `tab`.

Every scenario in [`mux.feature`](./mux.feature) maps to one of these behaviors:

| Behavior | What it covers |
|---|---|
| **backend selected by environment** | tmux vs herdr selection; neither present errors |
| **placement** | `--at` choices; default tab; tab honored per backend, never a split |
| **multiplexer detection is two-mode** | `$CYBERLEGION_MUX` fast-path + override; ancestry walk; hint fallback; `mux doctor` hint; `unit spawn` propagation |
| **mux mode** | reports the detected session backend; "none" (exit 0) when no adapter is selectable |
