---
title: 'CLI: init'
description: 'CLI reference for cyberlegion init: detect the harness, register the surfacing hook, and advise on binding the owner pane.'
---

```sh
npx cyberlegion init [--agent <h>] [--dir <path>] [--pin <version>]
```

`init` is the onboarding front door's mechanical half: resolve this session's harness, register
the Legion surfacing hook into its config, and advise binding the owner pane. It does the wiring
only — it never asks a question and never binds anything itself. The judgment (is this a root
session? should we offer to bind? has an owner already been minted?) belongs to the [`init-cyberlegion`
skill](/skills/init-cyberlegion/), which runs this command as its step 2.

This is a distinct command from the `init-cyberlegion` **skill** — same name-adjacent concept,
different job. Run this directly only when scripting a known harness; use the skill for a guided,
interactive setup.

## Options

| Option | Meaning |
|---|---|
| `--agent <h>` | `claude` \| `cursor` \| `codex` (else auto-detected) |
| `--dir <path>` | project dir to write config into (default: current working directory) |
| `--pin <version>` | version to pin the registered npx hook command to (e.g. the bundled plugin version) |

## Output

A `hooks` table (`event`, `status`, `file`) with an aggregate `harness <name>, <N> hooks`. This
step is idempotent: an already-registered hook reports `already present` — a clean no-op, never a
duplicate registration and never an error.

When no standing owner is registered yet, `init` suggests two next steps: `unit register
--standing --handle <name>` to mint the durable owner inbox, and `attach` to bind the current pane
as the owner's live presence.

## Related

- [Skill: init-cyberlegion](/skills/init-cyberlegion/) — the guided onboarding flow this command
  is a step of
- [CLI: unit](/cli/unit/) — `unit register --standing` mints the owner identity this command
  advises on
- [CLI: attach](/cli/attach/) — binds the pane this command advises on
- [CLI: mail](/cli/mail/) — `mail hook` is what the registered hook calls on each harness event
