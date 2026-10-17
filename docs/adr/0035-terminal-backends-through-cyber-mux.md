# ADR-0035: Terminals with a control API as session backends

## Status

Proposed — an RFC, not yet a decision. The adapters are cyber-mux's to build; this records what
cyberlegion would have to change to use them. If accepted it becomes a cross-package decision on
[cyber-civitas](https://cyber-civitas.github.io/decisions/).

## Context

`unit spawn` accepts tmux and herdr only. cyber-mux already detects WezTerm and zellij, and
`selectSessionAdapter` refuses them before opening anything, for one reason: `AgentRecord.pane`
types its multiplexer as `'tmux' | 'herdr'`, so a pane opened on anything else could not be
recorded. A unit nobody can name cannot be rung, read, closed, or pruned.

Some terminals have a control API that does everything a backend needs: open a session and get an id
back, send text to that id, read its output, and list what is alive.

| Terminal | Open | Id back | Send text | List / alive |
|---|---|---|---|---|
| WezTerm (`wezterm cli`) | `spawn` | pane id | `send-text` | `list` |
| kitty (remote control) | `launch` | window id | `send-text` | `ls` |
| iTerm2 (AppleScript or Python API) | `create tab` | session id | `write text` | session list |

These are the documented commands as of writing and need checking against current versions before
an adapter is built. Terminals without such an API (Windows Terminal, GNOME Terminal, Terminal.app)
cannot be backends; [ADR-0034](0034-terminal-views-for-background-units.md) covers what they can do.

Unlike the Claude background-session backend, these backends work for every harness, so they are
the route for Cursor and Codex units outside tmux and herdr.

## Proposal

1. **cyber-mux adds adapters** for WezTerm, kitty, and iTerm2, each meeting the `MuxAdapter`
   contract and [ADR-0025](0025-session-adapter-verify-effect-or-fail-loud.md)'s verify-effect rule.
   Detection already exists for WezTerm.
2. **cyberlegion widens the pane locator** so a record can carry any backend selection accepts. The
   locator becomes a tagged value whose tag is the backend name, with backend-specific fields beside
   the id, as tmux's `window` and `session` are today.
3. **Selection stays one function.** `selectSessionAdapter` returns the detected backend when the
   locator can carry it, and refuses otherwise, unchanged in shape.

## Open questions

- **Locator shape.** A closed union per backend gives type checking. An open tag with an opaque
  payload lets cyber-mux add a backend without a cyberlegion release. Item 2 is the expensive part
  to reverse, because records written in one shape must be readable after a change, so this should
  be settled before the Claude background-session backend adds its own locator kind.
- **Order.** WezTerm first: cyber-mux already detects it, and it runs on Linux, macOS, and Windows.

## Consequences

- No change to how a unit is rung, read, or closed: the new backends go through the same adapter
  members tmux and herdr use.
- Every place that switches on `pane.mux` (`unit-runtime.ts`'s `paneAdapter`, prune's liveness
  check) gains a case per backend.
