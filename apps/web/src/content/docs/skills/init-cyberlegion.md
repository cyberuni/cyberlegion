---
title: 'Skill: init-cyberlegion'
description: What the init-cyberlegion skill does, what it asks you to approve before allowing the CLI or binding the owner pane, and what it leaves alone.
---

`init-cyberlegion` is the onboarding front door to the Legion, a thin user-invocable wrapper that
walks a session through getting `cyberlegion` working in a repo: probe the environment, register
the surfacing hook, and (only in a root session, only on an explicit yes) allow the `cyberlegion`
CLI in Claude Code's permissions and bind this pane as the durable owner inbox. It is a **thin wrapper**: every mechanic is a [`cyberlegion` CLI](/cyberlegion/cli/) call.
The skill holds the *conversation and the judgment* (is this a root session? should we ask to
bind? what does the environment look like?); the CLI holds all the *mechanism*.

## Run it

```text
/cyberlegion:init-cyberlegion
```

It also triggers on prose: "set up cyberlegion," "onboard the legion," "register the cyberlegion
surfacing hook," "make this pane my main legion inbox," or "get cyberlegion working in this repo."

## The five steps

### 1. Probe the environment

Runs [`mux doctor`](/cyberlegion/cli/mux/#doctor) before touching the hook or any identity. Reads `harness`,
`mux`, `pane`, `hubRoot`, `selfId`, `permissionRule` to learn the environment and to detect root
vs. spawned (step 3), and narrates a grounded summary (including, say, "permission rule: missing"),
never inventing facts the probe didn't report.

### 2. Register the surfacing hook, and allow the CLI on a yes

Runs [`init`](/cyberlegion/cli/init/), auto-detecting the harness by default. This step is idempotent. An
already-registered hook reports `already present`, a clean no-op rather than a duplicate
registration or an error.

On Claude Code, without a `permissions.allow` rule covering `cyberlegion`, the auto-mode classifier
can deny a unit's `cyberlegion mail send`, and the unit's report never reaches you. When the probe
reports the rule `missing` in a root session, the skill first asks whether to add
`Bash(cyberlegion *)` to your Claude Code user settings. On a yes it runs
[`init --allow-cli`](/cyberlegion/cli/init/#the-permission-rule-claude-code), which merges the rule
into your existing list. A spawned unit never changes your settings. It reports the rule as missing
instead.

### 3. Detect root vs. spawned, derived and never asked

Reads the probe's `selfId` from step 1: a root session has `spawnedBy` unset, a spawned unit has it
set. This is derived from the probe, never asked of the user. A spawned unit, or a request scoped
only to registering the hook, stops here.

### 4. Ask before binding, never silently

Only a root session with no owner bound yet is offered the bind, and only with a plain, explicit
question. Declining leaves the registered hook in place and does nothing else. An already-bound
root session never reaches this ask again.

### 5. On an explicit yes, mint and bind

Runs, in this order, `unit register --standing --handle legate` (mints the durable owner inbox)
then [`attach`](/cyberlegion/cli/attach/) (binds the current pane as that owner's live presence). If the probe
reported no multiplexer or pane, `attach` is a no-op. That is expected, not a failure; the standing owner
still gets registered, and the root session falls back to surfacing owner mail via the
`!spawnedBy` check instead of a bound pane.

## Rules the skill follows

- Every mechanic is a `cyberlegion` CLI call. It writes no hub state itself, invents no config
  format, and never edits Claude Code's settings by hand.
- Its only filesystem read outside the CLI is the plugin's own bundled version-pin map, to resolve
  which CLI version to invoke.
- It reads the CLI version to use once, before the flow, rather than scraping it from prose.

## What it will not do

- It never mints or binds an owner identity without an explicit user yes.
- It never adds the permission rule without an explicit user yes in a root session.
- It is distinct from [`legate`](/cyberlegion/skills/legate/): sending, spawning, or dispatching to a peer is
  `legate`'s job, not this skill's.
- It is distinct from [`manage-inbox`](/cyberlegion/skills/manage-inbox/): reading or acking owner mail once
  bound is `manage-inbox`'s job, not this skill's.
- An unrelated "init" intent (a git repo, an npm package, commit discipline) is out of scope; it
  defers to the matching unrelated skill or declines.

## Troubleshooting

If a unit's `cyberlegion mail send` is denied by Claude Code's auto-mode classifier as *External
System Writes*, the `Bash(cyberlegion *)` permission rule is missing. Run this skill from a root
session and say yes to the permission ask.

## Related

- [Installation](/cyberlegion/getting-started/installation/): the first-run path this skill is normally
  reached from
- [CLI: init](/cyberlegion/cli/init/) · [CLI: attach](/cyberlegion/cli/attach/) · [CLI: mux](/cyberlegion/cli/mux/): the commands
  behind each step
- [Skill: manage-inbox](/cyberlegion/skills/manage-inbox/): what to reach for once the owner inbox exists
