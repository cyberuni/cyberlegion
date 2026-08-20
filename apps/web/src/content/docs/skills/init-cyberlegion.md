---
title: 'Skill: init-cyberlegion'
description: What the init-cyberlegion skill does, what it asks you to approve before binding the owner pane, and what it leaves alone.
---

`init-cyberlegion` is the onboarding front door to the Legion — a thin, user-invocable wrapper that
walks a session through getting `cyberlegion` working in a repo: probe the environment, register
the surfacing hook, and — only in a root session, only on an explicit yes — bind this pane as the
durable owner inbox. It is a **thin wrapper**: every mechanic is a [`cyberlegion` CLI](/cli/) call.
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

Runs [`mux doctor`](/cli/mux/#doctor) before touching the hook or any identity. Reads `harness`,
`mux`, `pane`, `hubRoot`, `selfId` to learn the environment and to detect root vs. spawned (step 3)
— and narrates a grounded summary, never inventing facts the probe didn't report.

### 2. Register the surfacing hook

Runs [`init`](/cli/init/), auto-detecting the harness by default. This step is idempotent — an
already-registered hook reports `already present`, a clean no-op rather than a duplicate
registration or an error.

### 3. Detect root vs. spawned — derived, never asked

Reads the probe's `selfId` from step 1: a root session has `spawnedBy` unset, a spawned unit has it
set. This is derived from the probe, never asked of the user. A spawned unit, or a request scoped
only to registering the hook, stops here.

### 4. Ask before binding — never silent

Only a root session with no owner bound yet is offered the bind, and only with a plain, explicit
question. Declining leaves the registered hook in place and does nothing else. An already-bound
root session never reaches this ask again.

### 5. On an explicit yes — mint and bind

Runs, in this order, `unit register --standing --handle legate` (mints the durable owner inbox)
then [`attach`](/cli/attach/) (binds the current pane as that owner's live presence). If the probe
reported no multiplexer or pane, `attach` is a no-op — expected, not a failure; the standing owner
still gets registered, and the root session falls back to surfacing owner mail via the
`!spawnedBy` check instead of a bound pane.

## Rules the skill follows

- Every mechanic is a `cyberlegion` CLI call — it writes no hub state itself and invents no config
  format.
- Its only filesystem read outside the CLI is the plugin's own bundled version-pin map, to resolve
  which CLI version to invoke.
- It reads the CLI version to use once, before the flow, rather than scraping it from prose.

## What it will not do

- It never mints or binds an owner identity without an explicit user yes.
- It is distinct from [`legate`](/skills/legate/) — sending, spawning, or dispatching to a peer is
  `legate`'s job, not this skill's.
- It is distinct from [`manage-inbox`](/skills/manage-inbox/) — reading or acking owner mail once
  bound is `manage-inbox`'s job, not this skill's.
- An unrelated "init" intent — a git repo, an npm package, commit discipline — is out of scope; it
  defers to the matching unrelated skill or declines.

## Related

- [Installation](/getting-started/installation/) — the first-run path this skill is normally
  reached from
- [CLI: init](/cli/init/) · [CLI: attach](/cli/attach/) · [CLI: mux](/cli/mux/) — the commands
  behind each step
- [Skill: manage-inbox](/skills/manage-inbox/) — what to reach for once the owner inbox exists
