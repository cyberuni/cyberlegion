# cyberlegion

[![npm version](https://img.shields.io/npm/v/cyberlegion.svg)](https://www.npmjs.com/package/cyberlegion)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Harness-agnostic, MCP-free agent session spawning, messaging, and dispatch over the filesystem (Claude Code, Cursor, Codex).

The CLI is pure mechanism — dumb hands a routing layer composes. It never decides *how* to reach a peer (warm-peer session vs cold subagent vs run-inline); it just spawns, messages, and dispatches. State lives under a shared hub root (`$CYBERLEGION_ROOT`, else the global hub).

## Usage

No install required — run with `npx`:

```sh
npx cyberlegion <command>
```

Or pin to an exact version for reproducible hooks:

```sh
npx cyberlegion@0.1.0 <command>
```

## Commands

### identity — self-identify and discover peers

```sh
npx cyberlegion identity register --handle scout   # register/refresh this session
npx cyberlegion identity whoami                     # print your own identity
npx cyberlegion identity who                        # list addressable peers
npx cyberlegion identity prune                      # mark dead agents exited and sweep
```

### session — warm peer session lifecycle over a multiplexer

```sh
npx cyberlegion session spawn --agent reviewer      # launch a peer in its own git worktree (tmux/herdr)
npx cyberlegion session list                         # list live peer sessions
npx cyberlegion session focus <ref>                  # move input focus to a peer's session
npx cyberlegion session nudge <ref>                  # ring a peer's session (doorbell)
npx cyberlegion session read <ref>                   # scrape a peer's session screen
npx cyberlegion session close <id>                   # tear down worktree + session, reap state
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

### dispatch — delegate work and await a result

```sh
npx cyberlegion dispatch prep                        # allocate id + brief + result slot (spawns nothing)
npx cyberlegion dispatch channel --agent worker --wait  # prep + spawn + await the reply
npx cyberlegion dispatch collect <id>                # read + validate a subagent's result file
```

### agent — resolve reusable agent definitions

Reads definitions under `.agents/agents/`.

```sh
npx cyberlegion agent list                           # list resolvable agent definitions
npx cyberlegion agent show <name>                    # show a resolved def (model/effort/harness/…)
npx cyberlegion agent resolve <name>                 # emit the full machine payload for a routing caller
npx cyberlegion agent path <name>                    # print the resolved def file path
```

### admin — setup and diagnostics

```sh
npx cyberlegion admin install                        # wire the mail-surfacing hook into a harness config
npx cyberlegion admin doctor                         # probe harness, multiplexer, hub root, self-id
npx cyberlegion admin mode                            # report the detected session-backend mode
npx cyberlegion admin migrate                        # merge one hub root state into another
```

Top-level shortcuts are provided for the common verbs: `spawn`, `send`, `inbox`, `who`.

## Global options

| Option              | Description                                                        |
|---------------------|-------------------------------------------------------------------|
| `--space <path>`    | Isolate the hub root (overrides the global hub / `$CYBERLEGION_ROOT`) |
| `--format <format>` | Output format: `toon` (default) or `json`                         |

## License

MIT
