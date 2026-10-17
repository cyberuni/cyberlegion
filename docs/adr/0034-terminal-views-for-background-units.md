# ADR-0034: Terminal views for units with no pane

## Status

Proposed — an RFC, not yet a decision. It depends on the Claude background-session backend landing
first, because a view only makes sense for a unit whose session lives somewhere other than a pane.

## Context

`unit spawn` needs a session backend. Today that is a terminal multiplexer, tmux or herdr, and spawn
refuses outside one. The Claude background-session backend removes that requirement for Claude
units: the session runs under `claude --bg`, and Claude Code itself gives the handle, the liveness
check, and the stop.

A background session is invisible until someone runs `claude attach <id>`. A person who spawned a
unit outside a multiplexer usually wants to watch it, and most terminals can open a new tab or window
from the command line: Windows Terminal (`wt.exe new-tab`), GNOME Terminal, Terminal.app, iTerm2,
WezTerm, kitty.

What most of them cannot do is act on that tab afterwards. Windows Terminal returns no id for the tab
it opened, cannot list tabs, and cannot send text to one. A backend has to open a session, name it,
ring it, and check it is alive. A terminal that can only open is not a backend. Recording its tab as
a unit's pane would create the stranded session that `mux-select.ts` refuses WezTerm to avoid: a
record no caller can ring and `prune` cannot reap.

## Proposal

Separate the **backend** that owns a unit's session from a **view** that shows it.

- The record stores the backend only. For a background unit that is the Claude session id. A view is
  never recorded.
- `unit spawn --view` (or a hub setting) opens a tab in a launch-only terminal that runs
  `claude attach <id>`. From WSL, that is
  `wt.exe -w 0 new-tab wsl.exe -d <distro> -- claude attach <id>`.
- Opening a view is best-effort. Spawn has already landed when the view opens, so a view that fails
  is a warning on the result, never a failed spawn.
- Closing the tab only detaches the viewer. The unit keeps running, and `unit close` still goes
  through the backend.

Because nothing about the unit's life depends on the view, the view needs no verification under
[ADR-0025](0025-session-adapter-verify-effect-or-fail-loud.md): the rule binds a backend's mutating
ops, and a view has none.

## Open questions

- **Default on or off.** On is friendlier to a person at a desk. Off is right for a scheduler or CI,
  which has no screen to open a tab on. A hub setting with the flag as an override is the likely
  answer.
- **Terminal detection.** `$WT_SESSION` marks Windows Terminal, and `$TERM_PROGRAM` marks iTerm2 and
  Terminal.app. Whether detection or an explicit setting picks the terminal is open.
- **Which terminals first.** Windows Terminal, since it is the maintainer's environment.

## Consequences

- A view adds visibility, not mechanism. It does not ring a unit; the backend's doorbell does.
- The record format does not change.
- Units of a harness with no background mode (Cursor, Codex) gain nothing from this, because they
  still need a multiplexer backend. That case belongs to
  [ADR-0035](0035-terminal-backends-through-cyber-mux.md).
