---
title: 'CLI: mux'
description: 'CLI reference for cyberlegion mux: doctor and mode — multiplexer detection and diagnostics.'
---

```sh
npx cyberlegion mux <doctor|mode> ...
```

`mux` is the unit-agnostic pane layer — detection and diagnostics for the multiplexer (tmux or
herdr) a unit might be running under. It carries zero unit knowledge; see [Architecture: Two
layers](/concepts/architecture/#two-layers-one-way-dependency). Only `doctor` and `mode` surface to
a user — everything else in the mux layer is internal, composed by the `unit`/`mail`/`attach`
commands.

## doctor

```sh
npx cyberlegion mux doctor
```

Probe harness, multiplexer (ancestry-discovered), hub root, and self-id. Output: `harness`, `mux`,
`pane`, `via`, `hubRoot`, `selfId`. When a multiplexer is found, suggests exporting
`CYBER_MUX`/`CYBER_MUX_PANE` to pin the fast path and skip ancestry discovery on later calls.

This is the first command the [`init-cyberlegion` skill](/skills/init-cyberlegion/) runs, and the
one `dispatch-governance` runs to check whether a **channel** dispatch strategy (a live peer pane)
is even available.

## mode

```sh
npx cyberlegion mux mode
```

Report the detected session-backend mode. Output: `mode` — the detected adapter name, or `none`
when no multiplexer is detected.

## Related

- [Architecture](/concepts/architecture/) — the mux/legion layer split and the mux plane's authority
- [CLI: attach](/cli/attach/) — binds a pane this layer can locate
- [Skill: init-cyberlegion](/skills/init-cyberlegion/) — runs `mux doctor` as its first onboarding step
