---
title: Installation
description: Install the cyberlegion CLI via npx and the agent plugin via the cyberplace marketplace.
---

## The CLI

No install required — run with `npx`:

```sh
npx cyberlegion <command>
```

Or pin to an exact version for reproducible hooks (recommended for anything registered into a
harness config, such as the surfacing hook `init` writes):

```sh
npx cyberlegion@0.3.1 <command>
```

## The agent plugin

The plugin ships the Legate routing layer, its user-facing skills (`legate`, `manage-inbox`,
`init-cyberlegion`), its internal governance skills, and the `headless-legate` subagent for
unattended dispatch. In Claude Code:

```text
/plugin marketplace add cyberuni/cyberlegion
/plugin install cyberlegion
```

Or, via the `cyberplace` skill installer, as a plugin inside the `cyberplace` marketplace:

```sh
npx skills add cyberuni/cyberplace --plugin cyberlegion --global
```

## First run

Once either the CLI or the plugin is available, onboard the session:

```sh
npx cyberlegion init
```

This detects the harness and registers the mail-surfacing hook — see the
[`init-cyberlegion` skill](/skills/init-cyberlegion/) for the guided version, which also offers to
bind the current pane as the durable owner inbox, and [`cli/init`](/cli/init/) for the raw
command reference.

## Related

- [Introduction](/getting-started/introduction/) — what cyberlegion is
- [CLI: init](/cli/init/) — the onboarding command reference
- [Skill: init-cyberlegion](/skills/init-cyberlegion/) — the guided onboarding flow
