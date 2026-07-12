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
- **Placement maps each `--at` value onto the backend** — `--at pane:right|pane:down|tab|workspace`
  chooses where the new session opens. This layer only maps a **resolved** placement onto the backend;
  the spawn-mode-keyed **default** (new-worktree → `workspace`, `--cwd` → `tab`) lives in `unit/`
  lifecycle, and `unit spawn` always resolves a concrete `--at` before calling this layer. (The
  adapter keeps a defensive `at ?? 'tab'` fallback in code, but it is unreachable from `unit spawn`
  and carries no user-observable behavior to spec — so it has no scenario.) `tab` maps to each
  backend's native Tab primitive — tmux `new-window`, herdr
  `tab create` — never a split pane. `workspace` maps to each backend's own **visible** space — herdr
  `worktree create` (a new workspace nested under the source), tmux `new-window` (a window visible in
  the status bar). Every placement opens without stealing the caller's focus.
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
`pane:right`/`pane:down` (**Pane**), `tab` (**Tab**), `workspace` (**Workspace**). The property
`workspace` guarantees is **its own space, VISIBLE in the attached client and navigable** — not a
structural tier. tmux, having no Workspace level, maps `workspace` onto the finest unit that keeps
that property: a new **Window** (visible in the status bar, `select-window`-able) — the same unit
`tab` maps to, so under tmux `workspace` and `tab` collapse to a Window. It is deliberately **not** a
new detached **Session** (`new-session -d`): a detached session is invisible to the attached client
and unreachable by beaming (`select-window`, #158), so a ship is never spawned there — a truly
detached session would be a separate explicit intent, out of scope. There is no `window` value —
"window" is tmux's local name for the **Tab** concept, already covered by `tab`.

Every scenario in [`mux.feature`](./mux.feature) maps to one of these behaviors:

| Behavior | What it covers |
|---|---|
| **backend selected by environment** | tmux vs herdr selection; neither present errors |
| **placement** | `--at` choices; tab honored per backend, never a split; `workspace` → each backend's own visible space (herdr nested workspace, tmux window), never a detached tmux session |
| **multiplexer detection is two-mode** | `$CYBERLEGION_MUX` fast-path + override; ancestry walk; hint fallback; `mux doctor` hint; `unit spawn` propagation |
| **mux mode** | reports the detected session backend; "none" (exit 0) when no adapter is selectable |
