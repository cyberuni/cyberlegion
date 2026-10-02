---
title: 'CLI: init'
description: 'CLI reference for cyberlegion init: detect the harness, set up the surfacing hook, and advise on binding the owner pane.'
---

```sh
npx cyberlegion init [--agent <h>] [--dir <path>] [--pin <version>]
```

`init` is the onboarding front door's mechanical half: resolve this session's harness, set up the
Legion surfacing hook, and advise binding the owner pane. It does the wiring
only. It never asks a question and never binds anything itself. The judgment (is this a root
session? should we offer to bind? has an owner already been minted?) belongs to the [`init-cyberlegion`
skill](/cyberlegion/skills/init-cyberlegion/), which runs this command as its step 2.

This is a distinct command from the `init-cyberlegion` **skill**. Same name-adjacent concept,
different job. Run this directly only when scripting a known harness; use the skill for a guided,
interactive setup.

## Where the hook comes from

The hook must run the CLI the session was installed with, never a copy `npx` resolves from the
registry when the hook fires. How `init` gets there depends on the harness:

| Harness | What `init` does | The hook command |
|---|---|---|
| Claude Code, Codex | writes no project hook: the plugin ships its own `hooks/hooks.json`. Removes a project hook an earlier `init` wrote, so the hook does not fire twice, and a PostToolUse project hook an earlier `init` wrote, since that event is retired | `node "${CLAUDE_PLUGIN_ROOT}/bin/cyberlegion.mjs" mail hook --event SessionStart` |
| Cursor | registers a SessionStart hook in `.cursor/hooks.json` | `if command -v cyberlegion >/dev/null 2>&1; then cyberlegion mail hook --event SessionStart; else npx -y cyberlegion[@<pin>] mail hook --event SessionStart; fi` |

On Cursor, a `cyberlegion` on `PATH` (a spawned unit's shim, or one you installed) runs first. The
pinned `npx` runs only when there is none.

## Options

| Option | Meaning |
|---|---|
| `--agent <h>` | `claude` \| `cursor` \| `codex` (else auto-detected) |
| `--dir <path>` | project dir to write config into (default: current working directory) |
| `--pin <version>` | version the Cursor hook's `npx` fallback fetches (e.g. the bundled plugin version) |

## Output

A `hooks` table (`event`, `status`, `file`) with an aggregate `harness <name>, <N> hooks`. Each
status is one of:

- `registered`: a new Cursor hook was written.
- `already present`: the Cursor hook was there already. An older form of it (bare `cyberlegion`,
  `npx cyberlegion[@<v>]`, or another pin) is rewritten in place, never duplicated.
- `provided by plugin`: Claude Code or Codex, where the plugin carries the hook.
- `removed project hook`: Claude Code or Codex, where an earlier `init` had written a project hook.

Running `init` again is always safe. It never touches a hook that isn't cyberlegion's.

When no standing owner is registered yet, `init` suggests two next steps: `unit register
--standing --handle <name>` to mint the durable owner inbox, and `attach` to bind the current pane
as the owner's live presence.

## Related

- [Skill: init-cyberlegion](/cyberlegion/skills/init-cyberlegion/): the guided onboarding flow this command
  is a step of
- [CLI: unit](/cyberlegion/cli/unit/): `unit register --standing` mints the owner identity this command
  advises on
- [CLI: attach](/cyberlegion/cli/attach/): binds the pane this command advises on
- [CLI: mail](/cyberlegion/cli/mail/): `mail hook` is what the surfacing hook calls on each harness event
