---
spec-type: behavioral
concept: [onboarding, identity]
---

# init — the `init-cyberlegion` onboarding skill

The onboarding front door to the Legion: the user-invocable `init-cyberlegion` skill walks a session
through getting `cyberlegion` working in this repo — probe the environment, register the surfacing
hook, and (only in a root session, only on an explicit yes) allow the `cyberlegion` CLI in Claude
Code's permissions and bind this pane as the durable `legate` owner inbox, offering that owner a
**home** to wake in when nobody is standing in for it. It is a **thin wrapper**: every mechanic is a `cyberlegion` CLI call. The skill holds
the *conversation and the judgment* (is this a root session? should we ask to bind? what does the
environment look like?); the CLI holds all the *mechanism* (registering hooks, minting identities,
binding panes, reading hub state).

**Fit:** strong — `init-cyberlegion` makes a genuine activation decision (same-keyword confusable
with `legate` and `manage-inbox`) **and** carries non-deterministic judgment branches (root-vs-spawned
detection, the never-silent bind-consent gate, non-mux parity), so all four ACED layers carry signal.

## Scope boundary — skill behavior, not CLI mechanics

```mermaid
flowchart TD
  U[user: "set up cyberlegion"] --> S{init-cyberlegion skill}
  S -->|probe| D[cyberlegion mux doctor]
  S -->|register hook| I["cyberlegion init [--agent]"]
  S -->|root? derive from probe / selfId| R{root session<br/>!spawnedBy?}
  R -->|no: spawned unit| STOP["stop after hook — no bind ask"]
  R -->|yes, no legate bound| ASK{ask user:<br/>bind this pane as legate?}
  ASK -->|no| KEEP["hook stays — nothing minted"]
  R -->|yes, broader intent, legate already minted| HOMEOFFER{offer: add a home<br/>or drop the one it has}
  R -->|yes, broader intent, legate already minted, no multiplexer| DONE
  HOMEOFFER -->|a folder| REHOME["unit register --standing --handle legate --home dir (--harness h | --agent def)"]
  HOMEOFFER -->|drop| CLEAR["unit register --standing --handle legate --clear-home"]
  HOMEOFFER -->|no| DONE[nothing runs]
  ASK -->|yes, no multiplexer| MINT
  ASK -->|yes, multiplexer| HOMEASK{explain the presence,<br/>ask for a home folder}
  HOMEASK -->|a folder| MINTH["unit register --standing --handle legate --home dir (--harness h | --agent def)"]
  HOMEASK -->|none| MINT[cyberlegion unit register --standing --handle legate]
  MINTH -.->|CLI refuses the folder| HOMEASK
  HOMEASK -->|a folder, no launch known| LAUNCHASK{ask for a harness<br/>or agent definition}
  LAUNCHASK --> MINTH
  MINTH -.->|--home is an unknown option| OLD{CLI predates homes:<br/>bare mint?}
  OLD -->|yes| MINT
  OLD -->|no| KEEP
  REHOME -.->|CLI refuses the folder| HOMEOFFER
  MINTH --> BIND
  MINT --> BIND[cyberlegion attach]
  BIND -.->|no multiplexer pane| NOOP[attach no-op; owner still minted;<br/>root surfaces mail via !spawnedBy fallback]
  D & I & MINT & MINTH & REHOME & CLEAR & BIND -.-> CLI[(cyberlegion CLI = all mechanism)]
```

Everything below the dashed line — how a hook is registered, how an owner identity is minted, how a
pane is bound, what `hubRoot` holds — is the sibling `cyberlegion` CLI project
(`packages/cyberlegion`) and is **out of scope for this node**. This node specs only the skill's
*agent behavior*: when it activates, what it delegates and in what order, and the three judgment gates
(root detection, bind consent, the home offer). The CLI's own package tests cover the mechanics.

## Use Cases

**Subject** — onboarding a session into the Legion: recognizing a setup/onboarding intent and
driving the `cyberlegion` CLI through probe → hook-registration → (root-only, consented) owner
mint + pane bind, narrating the environment and asking before any durable identity is created.

**Non-goals** — a direct request to give or drop the owner's home outside an onboarding run
("give my legate owner a home folder") is not routed here yet: the home is offered only from the
onboarding flow. Deciding that trigger is a recorded follow-up of the change that added the home. The CLI mechanics themselves (`mux doctor`, `init`, `unit register --standing`,
`attach` — the sibling `packages/cyberlegion` project); spawning, mailing, or dispatching
a peer (that is `legate`); reading or acking owner mail (that is `manage-inbox`); initializing a git
repo, an npm package, or commit discipline (unrelated skills). This node never touches the filesystem
or hub state directly and never invents a config format — every mechanic is a CLI call.

| Use case | Trigger | Inputs | Outcome |
|---|---|---|---|
| **onboard a root session (full flow)** | "set up cyberlegion", "onboard the legion", "get cyberlegion working in this repo" | a top-level / root pane (`!spawnedBy`) | probe → register hook → detect root → **ask** to bind → on yes, offer a home, mint `legate` owner (with the home, if one was named) + bind the pane |
| **register the surfacing hook only** | "register the cyberlegion surfacing hook" | any session | probe → `cyberlegion init [--agent]`; idempotent (`registered \| already present`) |
| **onboard a spawned / non-root unit** | a setup intent reached inside a spawned unit (`spawnedBy` set) | a non-root session | probe → register hook → **stop**; no bind ask (a non-root unit is never the owner inbox) |
| **bind this pane as the legate owner** | "make this pane my main legion inbox" | a root session with no `legate` bound yet | confirm → offer a home → mint `legate` owner + bind-main (the consented tail of the full flow) |
| **give the new owner a home** | the user said yes to the bind | a root session about to mint `legate` | explain the presence → ask for a home folder → a folder: mint with `--home <dir>` and one launch (`--harness` / `--agent`); no folder: mint bare, as before |
| **add or drop a home on an existing owner** | a broader onboarding intent where `legate` is already minted | a root session; the owner's record (with its `home`) read from `unit register --standing --format json` — the TOON listing carries no home. A bind request ("make this pane my main legion inbox") made when `legate` already exists counts as this intent | never re-ask the bind; no home → offer to add one; a home → name it and offer to drop it (`--clear-home`); a decline runs nothing |
| **allow the CLI in Claude Code** | the probe reports `permissionRule: missing` | a root session with a broader onboarding intent | **ask** to add `Bash(cyberlegion *)` → on yes, `init --allow-cli` merges it into the user `permissions.allow`; on no, plain `init` and the rule stays missing |
| **onboard where there is no multiplexer** | any setup intent in a no-pane environment | no `mux`/`pane` from the probe | hook registered, `legate` owner still minted on yes, `bind-main` is a no-op; the skill does not error, and the root session surfaces owner mail via the `!spawnedBy` fallback |

Each use case is covered by one-or-more `.feature` scenarios (happy path, its branch, and the
must-not-do guard). Trigger disambiguation from `legate` / `manage-inbox` / unrelated `init-*` skills
is covered by the `@trigger` outline and the routing-defer scenarios.

## The owner's home — presence first, home as the fallback

Mail to the `legate` owner reaches whoever stands in for it. Three things can, in this order
(the delivery doorbell, `packages/cyberlegion/.agents/spec/mail/doorbell/`):

1. **A live presence** — a session that ran `unit claim legate`. The binding holds until another
   session claims the owner, until `unit claim legate --clear` unbinds it, or until that session
   exits. It is rung on every delivery.
2. **The home** — when nobody holds the presence, a session is started in the home folder, bound as
   the presence, and woken to read the owner's inbox. A home **outranks the main pane**: with a home
   set, a delivery with no live presence starts a session rather than ringing the pane `attach` bound.
3. **The main pane** (`attach`) — the human's read-pane, rung only when focused, used when there is
   neither a presence nor a home.

So the skill explains the presence **before** it asks about a home: a user who wants mail to ring
the pane they are sitting in claims the owner from it; the home is for the hours nobody is there.

**A home is a folder plus one way to launch a session there.** The skill passes `--home <dir>` with
exactly one of `--harness <h>` (the harness the probe reported, or the one the user names) or
`--agent <def>` (an agent definition the user names, resolved from the home). The CLI checks a home
when it is registered (`unit/registry` owns the checks — a missing folder or a primary checkout, for
example) and writes nothing when it refuses, so the skill relays the reason and asks again rather than guessing a
different folder or quietly minting bare.

**Naming a folder is consent to trust it.** A session spawned into the home has the folder's trust
prompt accepted for it, on the strength of the person having named that folder at registration
(`mail/doorbell`). The skill says so when it asks.

**No multiplexer, no home offer.** `unit claim` refuses a caller with no multiplexer, and a home is
spawned through the same mechanism as `unit spawn`. When the probe reports no multiplexer or pane,
the skill neither explains the claim nor asks for a home; it mints the owner bare, as before, and
offers an existing owner neither to add nor to drop a home.

**A launch is never guessed.** The launch is the probe's `harness` unless the user names an agent
definition (passed as `--agent`, with no `--harness`) or another harness (passed instead of the
probe's). When the probe reported no harness and the user named no agent
definition, the skill asks for one rather than running `--home` with no launch.

**A CLI older than homes is said, not hidden.** If `unit register` rejects `--home` as an unknown
option, the installed CLI predates homes. The skill tells the user so and mints bare only on their
agreement; on a decline it mints nothing and does not run `attach`, and the hook stays. For an
existing owner it reports the same and changes nothing.

**"Bound" means minted.** In this node, a `legate` owner is *bound* (or *minted*) when the standing
listing (`unit register --standing --format json`) carries a `legate` record — not when a main pane
or a presence is bound. The frozen "does not re-mint the owner" means it does not mint a second
owner identity.

**Re-registering is not re-minting.** `unit register --standing --handle legate` on an existing owner
refreshes the same record — same id, bound presence kept. Adding a home (`--home`) or dropping it
(`--clear-home`) is that refresh, so an existing owner can be given or relieved of a home without
re-asking the bind or minting a second owner.

## Delegation contract (the rules this node specs as behavior)

- **Every mechanic is a `cyberlegion` CLI call.** The skill never writes hub state, never edits a hook
  file by hand, never invents a config format — it shells out to `mux doctor`, `init`,
  `unit register --standing`, `attach`.
- **Probe before acting.** `cyberlegion mux doctor` runs first; its report (`harness`, `mux`,
  `pane`, `hubRoot`, `selfId`) is the source of truth for the environment and for root detection.
- **`--agent` is conditional.** Pass `cyberlegion init --agent <name>` only when auto-detect fails or
  the user names a harness; otherwise plain `cyberlegion init`.
- **Idempotent hook registration.** Re-running on an already-set-up session is a clean no-op
  (`already present`), never a duplicate or an error.
- **The CLI version is read from the plugin's bundled map, never invented.** Before registering the
  hook, `init-cyberlegion` resolves which `cyberlegion` CLI version to run by reading the plugin's own
  bundled `${CLAUDE_PLUGIN_ROOT}/.plugin/pins.json`, which maps `cyberlegion` to a version. It never
  invents a version number or scrapes one out of prose.
- **The resolved pin is threaded into `init --pin`.** When `.plugin/pins.json` carries a `cyberlegion`
  entry, the skill runs `cyberlegion init --pin <version>` with that version, so a project hook's npx
  fallback (Cursor's; Claude Code and Codex get the plugin's own hook, `mail-hook/`) fetches that
  version.
- **A missing or unreadable map falls back to the unpinned CLI.** If `.plugin/pins.json` is absent,
  carries no `cyberlegion` entry, or is malformed (an unbundled workspace checkout or a corrupt map),
  the skill invokes the unpinned `cyberlegion` CLI and passes no `--pin` — it never invents a version
  number to fill the gap.
- **Root detection gates the bind ask.** Only a root session (`!spawnedBy`, derived from the probe /
  self-id) is ever offered the bind. A spawned unit stops after the hook.
- **Never bind silently.** The skill mints the `legate` owner and binds the pane **only** after an
  explicit user yes. No yes → the hook stays, nothing is minted.
- **The permission rule is consent-gated and CLI-written.** The probe's `permissionRule` (`present`,
  `missing`, `unreadable`, `n/a`) is narrated in the environment summary. Only a root session with a
  broader onboarding intent and the rule `missing` is asked whether to add `Bash(cyberlegion *)`;
  on an explicit yes the skill passes `--allow-cli` to `init`, which merges the rule into the
  existing array (never replacing it). The skill never edits Claude Code's settings by hand, never
  adds the rule without a yes, and never adds it from a spawned unit — a spawned unit reports the
  rule missing instead. An `unreadable` settings file is reported as needing a hand fix, not
  retried with `--allow-cli`. Without the rule, Claude Code's auto-mode classifier can deny a
  unit's `cyberlegion mail send` as *External System Writes*, so a finished unit cannot report back
  (#120); the skill documents that symptom as this rule missing.
- **A home is offered, never assumed.** The skill asks for a home folder only after the bind yes
  (or, for an existing owner, on a broader onboarding intent in a root session), passes `--home` only
  with a folder the user named, and passes exactly one launch flag with it. No folder → the bare
  mint. A spawned unit and a hook-only request are never offered a home.
- **The presence is explained with the home.** Before asking for a folder, the skill says that
  `unit claim legate` binds a live session as the presence until another claim, a `--clear`, or that
  session's exit, and that the home is used only when nobody holds the presence — ahead of the main
  pane. With no multiplexer it offers no home and mints bare.
- **Non-mux parity, not failure.** With no pane, `bind-main` is a no-op and the skill still mints the
  owner and completes cleanly; it never errors out of a no-pane environment.
