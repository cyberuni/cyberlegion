# cyberlegion

[![npm version](https://img.shields.io/npm/v/cyberlegion.svg)](https://www.npmjs.com/package/cyberlegion)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Harness-agnostic, MCP-free agent session spawning and messaging over the filesystem (Claude Code, Cursor, Codex).

The CLI is pure mechanism — dumb hands a routing layer composes. It never decides *how* to reach a peer (warm-peer session vs cold subagent vs run-inline); it just spawns and messages, and the routing brain composes those primitives (spawn a peer + await its mail, or run a cold subagent and take its Task result). State lives under a shared hub root (`$CYBERLEGION_ROOT`, else the global hub).

## Usage

No install required — run with `npx`:

```sh
npx cyberlegion <command>
```

Or pin to an exact version for reproducible hooks:

```sh
npx cyberlegion@0.3.0 <command>
```

## Commands

### unit — self-identify, discover peers, and manage session lifecycle

```sh
npx cyberlegion unit register --handle scout        # register/refresh this session
npx cyberlegion unit register --standing --handle homa  # mint a standing, session-independent owner inbox
npx cyberlegion unit whoami                          # print your own identity
npx cyberlegion unit who                             # list addressable peers / live peer sessions
npx cyberlegion unit prune                           # mark dead agents exited and sweep
npx cyberlegion unit spawn --agent reviewer          # launch a peer in its own git worktree (tmux/herdr)
npx cyberlegion unit focus <ref>                     # move input focus to a peer's session
npx cyberlegion unit nudge <ref>                     # ring a peer's session (doorbell)
npx cyberlegion unit read <ref>                      # scrape a peer's session screen
npx cyberlegion unit close <id>                      # tear down worktree + session, reap state
```

### mail — durable inter-agent messaging

```sh
npx cyberlegion mail send --to scout --body "ready"  # send a message (by handle or id)
npx cyberlegion mail inbox                            # list your mail
npx cyberlegion mail read <msg-id>                   # peek without acknowledging
npx cyberlegion mail ack <msg-id>                    # acknowledge (move out of unread)
npx cyberlegion mail delete <msg-id>                 # permanently remove a message
npx cyberlegion mail await                           # block until a thread reply arrives, print + ack
npx cyberlegion mail watch                           # stream new matching mail (observer only)
npx cyberlegion mail hook                            # emit the harness hook injection payload (JSON)
```

### agent — resolve reusable agent definitions

Reads definitions under `.agents/agents/`.

```sh
npx cyberlegion agent list                           # list resolvable agent definitions
npx cyberlegion agent show <name>                    # show a resolved def (model/effort/harness/…)
npx cyberlegion agent resolve <name>                 # emit the full machine payload for a routing caller
npx cyberlegion agent path <name>                    # print the resolved def file path
```

### mux — multiplexer diagnostics

```sh
npx cyberlegion mux doctor                           # probe harness, multiplexer, hub root, self-id
npx cyberlegion mux mode                              # report the detected session-backend mode
```

### init — onboarding

```sh
npx cyberlegion init                                 # wire the mail-surfacing hook into a harness config
```

### attach — the human's read-pane

```sh
npx cyberlegion attach                               # bind this pane as the hub's main (owner) pane
npx cyberlegion attach --show                        # print the bound main pane
npx cyberlegion attach --clear                       # unbind the main pane
```

### admin — hub-state maintenance

```sh
npx cyberlegion admin migrate                        # merge one hub root state into another
```

Top-level shortcuts are provided for the common verbs: `spawn`, `send`, `inbox`, `who`.

## Global options

| Option              | Description                                                        |
|---------------------|-------------------------------------------------------------------|
| `--space <path>`    | Isolate the hub root (overrides the global hub / `$CYBERLEGION_ROOT`) |
| `--format <format>` | Output format: `toon` (default) or `json`                         |

## Agent plugin

Agent session spawning, messaging, and dispatch — harness-agnostic, MCP-free. The foundation both
SDD and cyberfleet build on: a **Legion** of addressable agent units, mustered and reaped, commanded
and communicating over the filesystem.

### The console

The `cyberlegion` CLI is the cold, deterministic mechanism: identity (`unit register`, `unit claim`,
`unit who`), warm peer sessions in their own git worktrees (`unit spawn`, `unit close`,
`unit prune`), durable mail (`mail send`, `mail inbox`, `mail read`, `mail await`),
agent-definition resolution (`agent resolve`), hook registration (`init`), and
admin/diagnostics (`mux doctor`, `admin migrate`). It never decides *when* to spawn a peer
versus a subagent, and it carries no dispatch/result-slot primitives of its own — a cold subagent
returns via the caller's own Task-result, a warm peer via `mail await`.

### The Legate

The **Legate** is the routing brain on top of the console — the judgment the CLI deliberately does
not carry. In an attended session it runs in-session as `dispatch-governance`; with no user channel
it is realized headless as the `headless-legate` agent. Given an intent (fulfill a role with a brief, expect a
verdict), it reads the target agent-definition's `warm`/`interactive` tags and the environment's
multiplexer availability, then picks exactly one strategy:

- **channel** — a warm, interactive peer in its own pane (`unit spawn` + `mail await` on the thread)
- **run-inline** — no multiplexer to host a peer, so the caller does the work itself, in-session
- **subagent** — a cold, one-shot unit realized via the caller's own Task tool, taking its
  Task-result (final returned message) as the verdict

### The gateway

`legate` (the skill) is the thin front door — classify the request (send mail, check inbox,
spawn/close a unit, wait for a reply, dispatch work) and either run the matching CLI call directly or
hand routing judgment to `dispatch-governance`. It loads no governance itself and writes no state.

### Onboarding and the owner mailbox

Two more user-facing skills sit beside the gateway:

- **`init-cyberlegion`** — the onboarding front door: probe the environment, register the
  mail-surfacing hook so incoming mail reaches you mid-session, and (only in a root session, only on
  an explicit yes) bind this pane as the durable `legate` owner inbox. Every step is a
  `cyberlegion` CLI call; the skill holds the conversation and the judgment.
- **`manage-inbox`** — the human's surface for that **owner mailbox**: the hub-level,
  session-independent inbox a standing identity holds, where frameless agents (cron-started, no
  parent frame) push their reports. It's how you read and ack those reports from whichever session
  you happen to be in.

### Installation

```bash
npx skills add cyberuni/cyberplace --plugin cyberlegion --global
```

This package doubles as the plugin root: `plugin.json`, the generated `.claude-plugin/` and
`.codex-plugin/` manifests, `skills/`, and `agents/` all ship in the npm tarball. The bundle
carries the version it was built against in `.plugin/pins.json`, and its skills read that pin to invoke `npx cyberlegion@<version> …` rather than inventing a version. In a
workspace checkout with no bundled pin, they fall back to the unpinned `npx cyberlegion …` form or
the local bin (`packages/cyberlegion/bin/cyberlegion.mjs`).

## License

MIT
