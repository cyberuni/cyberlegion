---
spec-type: behavioral
concept: [onboarding, identity]
---

# init — the `init-cyberlegion` onboarding skill

The onboarding front door to the Legion: the user-invocable `init-cyberlegion` skill walks a session
through getting `cyberlegion` working in this repo — probe the environment, register the surfacing
hook, and (only in a root session, only on an explicit yes) bind this pane as the durable `legate`
owner inbox. It is a **thin wrapper**: every mechanic is a `cyberlegion` CLI call. The skill holds
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
  R -->|no: spawned unit| STOP[stop after hook — no bind ask]
  R -->|yes, no legate bound| ASK{ask user:<br/>bind this pane as legate?}
  ASK -->|no| KEEP[hook stays — nothing minted]
  ASK -->|yes| MINT[cyberlegion unit register --standing --handle legate]
  MINT --> BIND[cyberlegion attach]
  BIND -.->|no multiplexer pane| NOOP[attach no-op; owner still minted;<br/>root surfaces mail via !spawnedBy fallback]
  D & I & MINT & BIND -.-> CLI[(cyberlegion CLI = all mechanism)]
```

Everything below the dashed line — how a hook is registered, how an owner identity is minted, how a
pane is bound, what `hubRoot` holds — is the sibling `cyberlegion` CLI project
(`packages/cyberlegion`) and is **out of scope for this node**. This node specs only the skill's
*agent behavior*: when it activates, what it delegates and in what order, and the two judgment gates
(root detection, bind consent). The CLI's own package tests cover the mechanics.

## Use Cases

**Subject** — onboarding a session into the Legion: recognizing a setup/onboarding intent and
driving the `cyberlegion` CLI through probe → hook-registration → (root-only, consented) owner
mint + pane bind, narrating the environment and asking before any durable identity is created.

**Non-goals** — the CLI mechanics themselves (`mux doctor`, `init`, `unit register --standing`,
`attach` — the sibling `packages/cyberlegion` project); spawning, mailing, or dispatching
a peer (that is `legate`); reading or acking owner mail (that is `manage-inbox`); initializing a git
repo, an npm package, or commit discipline (unrelated skills). This node never touches the filesystem
or hub state directly and never invents a config format — every mechanic is a CLI call.

| Use case | Trigger | Inputs | Outcome |
|---|---|---|---|
| **onboard a root session (full flow)** | "set up cyberlegion", "onboard the legion", "get cyberlegion working in this repo" | a top-level / root pane (`!spawnedBy`) | probe → register hook → detect root → **ask** to bind → on yes, mint `legate` owner + bind the pane |
| **register the surfacing hook only** | "register the cyberlegion surfacing hook" | any session | probe → `cyberlegion init [--agent]`; idempotent (`registered \| already present`) |
| **onboard a spawned / non-root unit** | a setup intent reached inside a spawned unit (`spawnedBy` set) | a non-root session | probe → register hook → **stop**; no bind ask (a non-root unit is never the owner inbox) |
| **bind this pane as the legate owner** | "make this pane my main legion inbox" | a root session with no `legate` bound yet | confirm → mint `legate` owner + bind-main (the consented tail of the full flow) |
| **onboard where there is no multiplexer** | any setup intent in a no-pane environment | no `mux`/`pane` from the probe | hook registered, `legate` owner still minted on yes, `bind-main` is a no-op; the skill does not error, and the root session surfaces owner mail via the `!spawnedBy` fallback |

Each use case is covered by one-or-more `.feature` scenarios (happy path, its branch, and the
must-not-do guard). Trigger disambiguation from `legate` / `manage-inbox` / unrelated `init-*` skills
is covered by the `@trigger` outline and the routing-defer scenarios.

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
  entry, the skill runs `cyberlegion init --pin <version>` with that version, so the installed hook is
  version-pinned.
- **A missing or unreadable map falls back to the unpinned CLI.** If `.plugin/pins.json` is absent,
  carries no `cyberlegion` entry, or is malformed (an unbundled workspace checkout or a corrupt map),
  the skill invokes the unpinned `cyberlegion` CLI and passes no `--pin` — it never invents a version
  number to fill the gap.
- **Root detection gates the bind ask.** Only a root session (`!spawnedBy`, derived from the probe /
  self-id) is ever offered the bind. A spawned unit stops after the hook.
- **Never bind silently.** The skill mints the `legate` owner and binds the pane **only** after an
  explicit user yes. No yes → the hook stays, nothing is minted.
- **Non-mux parity, not failure.** With no pane, `bind-main` is a no-op and the skill still mints the
  owner and completes cleanly; it never errors out of a no-pane environment.
