---
name: init-cyberlegion
description: "Use this skill to set up or onboard cyberlegion in this session or repo — probe the environment, register the mail-surfacing hook, (in a root session, on your yes) allow the cyberlegion CLI in Claude Code's permissions, and bind this pane as the durable legate owner inbox. Triggers: 'set up cyberlegion', 'onboard the legion', 'register the cyberlegion surfacing hook', 'make this pane my main legion inbox', 'get cyberlegion working in this repo'. Not for spawning/messaging/dispatching a peer (that is legate), reading or acking owner mail (that is manage-inbox), or unrelated init like a git repo, npm package, or commit discipline."
---

# init-cyberlegion

The onboarding front door to the Legion — a thin, user-invocable wrapper that walks a session through
getting `cyberlegion` working in this repo: probe the environment, register the surfacing hook, and
(only in a root session, only on an explicit yes) allow the `cyberlegion` CLI in Claude Code's
permissions and bind this pane as the durable `legate` owner inbox, offering that owner a **home** to
wake in when nobody is standing in for it.
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
- **Root session where a `legate` owner is already bound** — do not re-ask the bind and do not mint a
  second owner; go to step 6 to offer a home. A bind request ("make this pane my main legion inbox")
  made when the owner already exists lands here too.

To tell whether the owner exists, list the standing owners:

```bash
node scripts/cyberlegion.mjs unit register --standing --format json
```

A record with `"handle": "legate"` is the owner. Its `home` field says where its presence is
spawned (`dir` plus `harness` or `agent`); no `home` field means it has none.

### 4. Ask before binding — never silent

Only a root session with no `legate` owner bound is offered the bind. Ask plainly, e.g.:

> "This looks like a root session with no legate owner bound yet. Bind this pane as the main legate
> owner inbox?"

- **User declines** — the registered hook stays in place; nothing else runs. Do not mint or bind.
- **User agrees explicitly** — proceed to step 5.
- **Already bound** — never reach this ask (see step 3).

### 5. On an explicit yes — offer a home, then mint and bind

**No multiplexer or pane in the probe** → skip the home: mint bare and continue (see *Non-mux parity*
below). `unit claim` refuses a caller with no multiplexer, and a home is spawned the same way
`unit spawn` opens a session.

Otherwise, before minting, explain the presence and ask for a home. Mail to the `legate` owner
reaches whoever stands in for it, in this order:

1. **A live presence** — a session that ran `unit claim legate`. The claim holds until another
   session claims the owner, until `unit claim legate --clear` unbinds it, or until that session
   exits.
2. **The home** — when nobody holds the presence, a session is started in the home folder, bound as
   the presence, and woken to read the owner's inbox. A home **outranks this pane**: with a home set,
   a delivery with no live presence starts a session there instead of ringing the pane `attach` binds.
   Say this in the question: setting a home means unclaimed mail no longer rings this pane.
3. **This pane** (`attach`) — rung only when focused, when there is neither a presence nor a home.

Ask plainly, e.g.:

> "Should the legate owner have a home — a folder where a session is started to act for it when
> mail arrives and nobody is live? While you're here, `cyberlegion unit claim legate` makes this
> session the one that gets the mail, until another session claims it, you run
> `unit claim legate --clear`, or this one exits; the home is only used when nobody holds it — and
> once it is set, mail nobody holds starts a session there instead of ringing this pane.
> A session started there has the folder's trust prompt accepted for it, since you named the
> folder. Name a folder, or say none."

**A folder** → mint with the home and **exactly one** launch:

```bash
node scripts/cyberlegion.mjs unit register --standing --handle legate --home <dir> --harness <harness>
node scripts/cyberlegion.mjs attach
```

`<harness>` is the `harness` the probe reported, or the one the user names instead — one of
`claude`, `cursor`, or `codex`. When the user
names an agent definition to launch there, pass `--agent <definition>` and **no** `--harness`. This
`--agent` is `unit register`'s — an agent definition resolved from the home — not `init --agent`.
If the probe reported `harness: unknown` and the user named no agent definition, ask for one — never
run `--home` without a launch, and never pass `--harness unknown`. Pass `<dir>` as an absolute path.

**None** → mint bare, as before:

```bash
node scripts/cyberlegion.mjs unit register --standing --handle legate
node scripts/cyberlegion.mjs attach
```

Run the mint and `attach` **in this order** and only after the explicit yes: mint the durable,
session-independent `legate` owner inbox first, then bind the current pane as the owner's main pane.

**The CLI refuses a home** (the folder does not exist, it is a repository's primary checkout, the
agent definition does not resolve from it) — it writes nothing. Tell the user its reason and ask for
another folder or none; do not pick a folder yourself and do not fall back to a bare mint unasked.
If it rejects `--home` as an unknown option, the CLI is older than homes: say so, and mint bare only
if the user agrees. On a decline, mint nothing and skip `attach`; the hook stays.

**Non-mux parity.** If the probe reported no multiplexer or pane, `attach` is a no-op —
that is expected, not a failure. Still run `unit register --standing --handle legate` on yes, and complete
**without erroring**. The root session surfaces owner mail via the `!spawnedBy` fallback instead of a
bound pane.

### 6. An owner already minted — add or drop a home

Reached only from step 3, in a root session with a broader onboarding intent, when `legate` is
already minted. Never re-ask the bind and never run `attach` here. Re-registering a standing owner
refreshes the same record — the same id, its bound presence kept — so it is not a second mint.

With no multiplexer or pane in the probe, offer nothing here — neither adding nor dropping a home.

- **No home** — explain the presence and the trust-prompt acceptance as in step 5 and offer to give the owner one. On a folder, run
  `unit register --standing --handle legate --home <dir>` with exactly one of `--harness` /
  `--agent`, exactly as in step 5; a refusal is handled the same way.
  If the CLI rejects `--home` (or `--clear-home`) as an unknown option, say it predates homes and
  change nothing.
- **A home** — name its folder and offer to drop it. On a yes:

  ```bash
  node scripts/cyberlegion.mjs unit register --standing --handle legate --clear-home
  ```

- **A decline** — run nothing.

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
- It never mints or binds an owner identity without an explicit user yes, and never sets or drops
  an owner's home except on a folder or a drop the user named.
- It is distinct from `legate` — sending/spawning/dispatching to a peer is `legate`'s job, not this
  skill's.
- It is distinct from `manage-inbox` — reading or acking owner mail once bound is `manage-inbox`'s
  job, not this skill's.
- An unrelated `init` intent (a git repo, an npm package, commit discipline) is out of scope — defer
  to the matching unrelated skill or decline.
