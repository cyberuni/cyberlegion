---
title: 'CLI: attach'
description: "CLI reference for cyberlegion attach: bind, show, or clear the hub's single main (owner) pane."
---

```sh
npx cyberlegion attach [--clear | --show]
```

`attach` is the human's read-pane — it binds the current pane as the hub's main pane, the owner's
live presence, so surfaced mail has somewhere to land. It does not create or require an identity;
binding is independent of `unit register --standing`, though the two are normally done together
during onboarding — see [Skill: init-cyberlegion](/skills/init-cyberlegion/).

## Options

| Option | Meaning |
|---|---|
| *(bare)* | bind the current pane as the hub's main pane |
| `--show` | print the bound main pane instead of binding |
| `--clear` | unbind the main pane (a no-op when nothing is bound) |

## Output

Bare and `--clear` emit `mainPane` (the bound pane id, or `none`). `--show` emits the same shape
without changing anything.

## Conflicts

Bare `attach` fails if there is no multiplexer pane to bind — it must be run from inside a tmux or
herdr pane. `--show` and `--clear` never fail this way; they only read or clear the stored binding.

## Related

- [Mail Model](/concepts/mail-model/) — the owner mailbox this pane surfaces mail into
- [CLI: mux](/cli/mux/) — `mux doctor` reports whether a pane is even available to bind
- [Skill: init-cyberlegion](/skills/init-cyberlegion/) — the guided flow that offers to run this,
  only in a root session and only on an explicit yes
