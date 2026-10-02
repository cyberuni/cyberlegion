---
name: init-cyberlegion
description: "Use this skill to set up or onboard cyberlegion in this session or repo — probe the environment, register the mail-surfacing hook, (in a root session, on your yes) allow the cyberlegion CLI in Claude Code's permissions, and bind this pane as the durable legate owner inbox. Triggers: 'set up cyberlegion', 'onboard the legion', 'register the cyberlegion surfacing hook', 'make this pane my main legion inbox', 'get cyberlegion working in this repo'. Not for spawning/messaging/dispatching a peer (that is legate), reading or acking owner mail (that is manage-inbox), or unrelated init like a git repo, npm package, or commit discipline."
---

# init-cyberlegion

The onboarding front door to the Legion — a thin, user-invocable wrapper that walks a session through
getting `cyberlegion` working in this repo: probe the environment, register the surfacing hook, and
(only in a root session, only on an explicit yes) allow the `cyberlegion` CLI in Claude Code's
permissions and bind this pane as the durable `legate` owner inbox.
It is a **thin wrapper**: every mechanic is a `cyberlegion` CLI call. The skill holds the *conversation
and the judgment* — is this a root session? should we ask to bind? what does the environment look
like? — the CLI holds all the *mechanism*.

> **Running the CLI.** Every `node scripts/cyberlegion.mjs …` command below runs the `cyberlegion` CLI
> this plugin ships. The path is relative to this skill's own directory, not the working directory.
>
> **Version pin.** Resolve the CLI version **once, before the flow**, by reading the plugin's bundled
> map at `${CLAUDE_PLUGIN_ROOT}/.plugin/pins.json` — a flat `{ "<package>": "<version>" }` map the
> release version flow keeps equal to the shipped package version. Look up the `cyberlegion` key:
>
> - **A version is found** → pass it to the hook registration in step 2 as `init --pin <version>`
>   so a project hook's npx fallback fetches the same shipped version. If you cannot resolve
>   `scripts/cyberlegion.mjs`, run `npx -y cyberlegion@<version>` in its place, with the same arguments.
> - **No `pins.json`, no `cyberlegion` key, or a malformed map** (an unbundled workspace checkout) →
>   pass **no** `--pin`; if you cannot resolve `scripts/cyberlegion.mjs`, fall back to the unpinned
>   `npx -y cyberlegion` form. **Never invent a version number.**
>
> Do not scrape the version from prose.

## Flow

### 1. Probe the environment

```bash
node scripts/cyberlegion.mjs mux doctor
```

Run this **before** touching the hook or any identity. It reports `harness`, `mux`, `pane`,
`hubRoot`, `selfId`, and `permissionRule` — read it to learn the environment (is there a
multiplexer? a pane? does Claude Code allow the CLI?) and to detect root vs spawned (see step 3).
Narrate a short, grounded summary of what it found, including the permission rule (e.g. "permission
rule: missing") — do not invent facts the probe did not report.

`permissionRule` is whether Claude Code's user settings carry a `permissions.allow` rule covering
`cyberlegion`: `present`, `missing`, `unreadable`, or `n/a` (not Claude Code). Without it, Claude
Code's auto-mode classifier can deny a unit's `cyberlegion mail send` as *External System Writes*,
so a unit that finished its work cannot report back. Step 2 handles it.

### 2. Register the surfacing hook (and, on a yes, allow the CLI)

```bash
node scripts/cyberlegion.mjs init --pin <version>
```

**The permission rule — ask first, never silent.** When the probe reported `permissionRule: missing`
in a **root** session with a broader onboarding intent (see step 3 for how root is derived), ask
before running `init`, e.g.:

> "Claude Code has no permission rule for `cyberlegion`, so its auto-mode classifier can block a
> unit's `cyberlegion mail send` and the unit's report never reaches you. Add
> `Bash(cyberlegion *)` to `permissions.allow` in your Claude Code user settings
> (`~/.claude/settings.json`)? It is merged into your existing list."

On an explicit yes, add `--allow-cli` to the `init` call — the CLI merges the rule into the existing
array, never replaces it, and refuses to rewrite a settings file it cannot parse:

```bash
node scripts/cyberlegion.mjs init --pin <version> --allow-cli
```

On a decline, run `init` without `--allow-cli` and say the rule stays missing. Never edit the
settings file by hand. Do not ask, and do not pass `--allow-cli`, when:

- the rule is `present` or `n/a` — nothing to do;
- the rule is `unreadable` — tell the user the settings file could not be parsed and must be fixed
  by hand; `--allow-cli` would refuse it;
- this is a **spawned** unit — it never changes the user's global settings; report the rule as
  missing in its result so the human can run this skill from a root session;
- the request is hook-only — report the rule's state and stop (see step 3).

Pass `--pin <version>` with the version resolved above so a project hook's npx fallback fetches the
shipped version; **omit `--pin`** when the map yielded no version.

Auto-detect is the default — no `--agent` flag. Pass `--agent <name>` **only** when `mux doctor` could
not auto-detect the harness, or the user named one explicitly (it composes with `--pin` and
`--allow-cli`):

```bash
node scripts/cyberlegion.mjs init --pin <version> --agent <name>
```

This step is **idempotent**: if the hook is already registered, `init` reports `already present` —
that is a clean no-op, never a duplicate registration and never an error. On Claude Code and Codex the
plugin ships the hook itself, so `init` reports `provided by plugin` (or `removed project hook` when it
cleared one an earlier `init` wrote); both mean the hook is set up. On Claude Code its summary also
reports `permission rule <state>` — `added` after `--allow-cli`, `present` when a covering rule was
already there.

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
node scripts/cyberlegion.mjs unit register --standing --handle legate
node scripts/cyberlegion.mjs attach
```

Run these **in this order** and only after the explicit yes: mint the durable, session-independent
`legate` owner inbox first, then bind the current pane as that owner's live presence.

**Non-mux parity.** If the probe reported no multiplexer or pane, `attach` is a no-op —
that is expected, not a failure. Still run `unit register --standing --handle legate` on yes, and complete
**without erroring**. The root session surfaces owner mail via the `!spawnedBy` fallback instead of a
bound pane.

## Troubleshooting

**A unit's `cyberlegion mail send` was denied by the auto-mode classifier** (*Permission for this
action was denied by the Claude Code auto mode classifier. Reason: [External System Writes]*) — the
`Bash(cyberlegion *)` permission rule is missing. Run this skill from a root session and say yes to
the permission ask, or run `cyberlegion init --allow-cli` there.

## Boundaries

- Every mechanic here is a `cyberlegion` CLI call — this skill writes no hub state, invents no
  config format, and never edits Claude Code's settings by hand (the permission rule goes in only
  through `init --allow-cli`, only on an explicit yes in a root session). Its only filesystem read is the plugin's own bundled `${CLAUDE_PLUGIN_ROOT}/.plugin/pins.json`
  version map, to resolve the CLI pin.
- It never mints or binds an owner identity without an explicit user yes.
- It is distinct from `legate` — sending/spawning/dispatching to a peer is `legate`'s job, not this
  skill's.
- It is distinct from `manage-inbox` — reading or acking owner mail once bound is `manage-inbox`'s
  job, not this skill's.
- An unrelated `init` intent (a git repo, an npm package, commit discipline) is out of scope — defer
  to the matching unrelated skill or decline.
