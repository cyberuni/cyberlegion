---
name: init-cyberlegion
description: "Use this skill to set up or onboard cyberlegion in this session or repo — probe the environment, register the mail-surfacing hook, and (in a root session, on your yes) bind this pane as the durable legate owner inbox. Triggers: 'set up cyberlegion', 'onboard the legion', 'register the cyberlegion surfacing hook', 'make this pane my main legion inbox', 'get cyberlegion working in this repo'. Not for spawning/messaging/dispatching a peer (that is legate), reading or acking owner mail (that is manage-inbox), or unrelated init like a git repo, npm package, or commit discipline."
---

# init-cyberlegion

The onboarding front door to the Legion — a thin, user-invocable wrapper that walks a session through
getting `cyberlegion` working in this repo: probe the environment, register the surfacing hook, and
(only in a root session, only on an explicit yes) bind this pane as the durable `legate` owner inbox.
It is a **thin wrapper**: every mechanic is a `cyberlegion` CLI call. The skill holds the *conversation
and the judgment* — is this a root session? should we ask to bind? what does the environment look
like? — the CLI holds all the *mechanism*.

> **Version pin.** Every invocation below reads `npx cyberlegion@<version> ...` — a placeholder.
> The package is not yet published to npm (`legion-publish` is a later CR in the extraction); until
> then, resolve the CLI from a workspace checkout (`packages/cyberlegion/bin/cyberlegion.mjs`) or
> whatever pinned version the project has declared. Never invent a version number.

## Flow

### 1. Probe the environment

```bash
npx cyberlegion@<version> admin doctor
```

Run this **before** touching the hook or any identity. It reports `harness`, `mux`, `pane`,
`hubRoot`, and `selfId` — read it to learn the environment (is there a multiplexer? a pane?) and to
detect root vs spawned (see step 3). Narrate a short, grounded summary of what it found — do not
invent facts the probe did not report.

### 2. Register the surfacing hook

```bash
npx cyberlegion@<version> init
```

Auto-detect is the default — plain `npx cyberlegion@<version> init`, no `--agent` flag. Pass
`--agent <name>` **only** when `admin doctor` could not auto-detect the harness, or the user named
one explicitly:

```bash
npx cyberlegion@<version> init --agent <name>
```

This step is **idempotent**: if the hook is already registered, `init` reports `already present` —
that is a clean no-op, never a duplicate registration and never an error.

### 3. Detect root vs spawned — derived, never asked

Read the probe's `selfId` from step 1. A **root** session has `spawnedBy` unset; a **spawned** unit
has it set. Derive this from the probe — never ask the user to declare it.

- **Spawned (non-root) unit** — stop here, right after the hook. Do not offer to bind; a spawned unit
  is never the owner inbox.
- **A hook-only request in a root session** ("just register the surfacing hook") — also stop here.
  Registering the hook satisfies the ask; do not proceed to the bind offer unasked.
- **Root session, broader onboarding intent, no `legate` owner bound yet** — continue to step 4.
- **Root session where a `legate` owner is already bound** — stop; do not re-ask, do not re-mint.

### 4. Ask before binding — never silent

Only a root session with no `legate` owner bound is offered the bind. Ask plainly, e.g.:

> "This looks like a root session with no legate owner bound yet. Bind this pane as the main legate
> owner inbox?"

- **User declines** — the registered hook stays in place; nothing else runs. Do not mint or bind.
- **User agrees explicitly** — proceed to step 5.
- **Already bound** — never reach this ask (see step 3).

### 5. On an explicit yes — mint and bind

```bash
npx cyberlegion@<version> identity owner --handle legate
npx cyberlegion@<version> identity bind-main
```

Run these **in this order** and only after the explicit yes: mint the durable, session-independent
`legate` owner inbox first, then bind the current pane as that owner's live presence.

**Non-mux parity.** If the probe reported no multiplexer or pane, `identity bind-main` is a no-op —
that is expected, not a failure. Still run `identity owner --handle legate` on yes, and complete
**without erroring**. The root session surfaces owner mail via the `!spawnedBy` fallback instead of a
bound pane.

## Boundaries

- Every mechanic here is a `cyberlegion` CLI call — this skill never touches the filesystem or hub
  state directly and never invents a config format.
- It never mints or binds an owner identity without an explicit user yes.
- It is distinct from `legate` — sending/spawning/dispatching to a peer is `legate`'s job, not this
  skill's.
- It is distinct from `manage-inbox` — reading or acking owner mail once bound is `manage-inbox`'s
  job, not this skill's.
- An unrelated `init` intent (a git repo, an npm package, commit discipline) is out of scope — defer
  to the matching unrelated skill or decline.
