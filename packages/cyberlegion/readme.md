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
npx cyberlegion@0.1.0 <command>
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

## License

MIT
