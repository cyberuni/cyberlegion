---
title: 'CLI: init'
description: 'CLI reference for cyberlegion init: detect the harness, set up the surfacing hook, and advise on binding the owner pane.'
---

```sh
npx cyberlegion init [--agent <h>] [--dir <path>] [--pin <version>] [--allow-cli]
                     [--allow-force-close] [--mail-environment]
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

## The permission rule (Claude Code)

Claude Code's auto-mode classifier can deny a `cyberlegion` call as an external write. When it
denies a unit's `cyberlegion mail send`, the unit finishes its work but cannot report back. A
`permissions.allow` rule covering `cyberlegion` in Claude Code's user settings
(`$CLAUDE_CONFIG_DIR/settings.json`, else `~/.claude/settings.json`) prevents that.

A rule matches one command prefix, and sessions run the CLI in several forms, so the rule is four
rules:

| Rule | Matches |
|---|---|
| `Bash(cyberlegion *)` | the bare command on `PATH` |
| `Bash(node *cyberlegion.mjs *)` | a skill's `scripts/cyberlegion.mjs` launcher, or the package's `bin/cyberlegion.mjs` |
| `Bash(npx cyberlegion@* *)` | a pinned `npx` run |
| `Bash(npx -y cyberlegion@* *)` | a pinned `npx -y` run |

The unpinned `npx -y cyberlegion` form is not covered. The skills fall back to it only from an
unbundled workspace checkout, and a `cyberlegion*` pattern would also match any other package whose
name starts with `cyberlegion`.

On Claude Code, `init` reports the rule's state: `present` when every form is covered, else
`missing`, or `unreadable`. With `--allow-cli` it appends the rules not yet covered to
`permissions.allow`, after the rules already there and keeping every other setting. The bare form
is also covered by `Bash(cyberlegion:*)`, and every form by `Bash(*)` or a bare `Bash`. When every
form is covered, it writes nothing. It refuses to rewrite a settings file that isn't valid JSON or
has a malformed `permissions.allow`, and fails before touching any hook. Without `--allow-cli`,
`init` never writes the user settings. It suggests the flag when the rule is missing.

If a unit's `cyberlegion mail send` is denied with *External System Writes*, this rule is missing.

## The auto-mode entries (Claude Code)

The auto-mode classifier blocks `cyberlegion unit close <id> --force` as a destructive action, even
right after you approved discarding that unit's work. `--force` deletes the unit's worktree and its
unpushed local branch, so the block is right by default. A permission rule cannot express the
condition that makes it safe, but Claude Code's natural-language `autoMode` lists in the same
settings file can:

- `--allow-force-close` appends a rule to `autoMode.allow` that allows the force-close, in any of
  the CLI's forms, **only when you approved discarding that specific unit's work in the same
  session**. An approval relayed through cyberlegion mail or another session does not count.
- `--mail-environment` appends a note to `autoMode.environment` that `cyberlegion mail send` is
  local agent-to-agent messaging, not an external transmission, so the classifier does not treat
  mail as data leaving the machine.

A list either flag creates starts with `"$defaults"`, so Claude Code's built-in rules stay in
force. An existing list is appended to as it is. An entry already there (an `autoMode.allow` entry
naming `cyberlegion`, `unit close`, and `--force`, or an `autoMode.environment` entry naming
`cyberlegion` and `mail send`) is left alone, and nothing is written. Every settings write keeps the
file's indentation and final newline, and a malformed `autoMode` is refused the same way as a
malformed `permissions.allow`.

## Options

| Option | Meaning |
|---|---|
| `--agent <h>` | `claude` \| `cursor` \| `codex` (else auto-detected) |
| `--dir <path>` | project dir to write config into (default: current working directory) |
| `--pin <version>` | version the Cursor hook's `npx` fallback fetches (e.g. the bundled plugin version) |
| `--allow-cli` | add the cyberlegion rules to Claude Code's user `permissions.allow` (Claude Code only) |
| `--allow-force-close` | add the user-approved `unit close --force` rule to Claude Code's user `autoMode.allow` (Claude Code only) |
| `--mail-environment` | add the local-messaging note for `mail send` to Claude Code's user `autoMode.environment` (Claude Code only) |

## Output

A `hooks` table (`event`, `status`, `file`) with an aggregate `harness <name>, <N> hooks`. On
Claude Code the aggregate ends with `permission rule <state>, force-close rule <state>, mail
environment <state>`, where each state is `added`, `present`, `missing`, or `unreadable`
(`permissionRule`, `forceCloseRule`, and `mailEnvironment` in `--format json`). Each hook
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
