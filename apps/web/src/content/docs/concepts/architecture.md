---
title: Architecture
description: How the cyberlegion CLI is organized, covering the mux/legion layer split, placement, capabilities, and the invariants that fall out of it.
---

The cyberlegion CLI is **pure mechanism**: it never selects a backend and never invokes a harness
subagent tool. Routing (deciding *when* to spawn a warm peer versus a cold subagent versus doing
the work in-session) is the caller's judgment, carried by the **Legate** (the plugin). Everything
below follows from holding the CLI to that line.

For the noun model behind every command, see [The Spine](/cyberlegion/concepts/spine/). For every
command group, see the [CLI Reference](/cyberlegion/cli/). To install, see
[Installation](/cyberlegion/getting-started/installation/).

## Two layers, one-way dependency

cyberlegion does two separable jobs. **Multiplexer management** (`mux`) is a unit-agnostic pane
abstraction over tmux/herdr, and you could run `btop` in a pane and never touch a unit. **Legion
management** (units, mail, defs) is built *on* the mux. They ship together, but the dependency
runs one way only: legion → mux, and the mux layer carries zero unit knowledge. Routing sits a
layer *above* the legion, in the plugin.

```
plugin · Legate    routing — warm/cold/inline choice, wake-vs-wait policy
      ▲ composes — the CLI never selects a backend
legion             unit · mail · agent(defs) · attach · init · admin
      ▲ depends on the pane abstraction
mux                doctor · mode   (+ internal open/close/read/write/focus)
```

Only `doctor` / `mode` surface to a user; the rest is the abstraction the legion composes. `nudge`
is *legion*: at the mux level it is just `write` (send-keys) with a doorbell meaning.

## Two planes: mail vs mux

A separate cut across the same layering: cyberlegion carries two communication planes with
different authority.

| Plane | Mechanism | Authority |
|---|---|---|
| **Mail plane** | `mail send` → per-agent inbox files | Peer. Non-authoritative by construction. |
| **Mux plane** | `unit nudge` / `unit clear` → keystrokes injected into the peer's pane | User turn. Indistinguishable from the human typing. |

A message delivered to a unit's inbox is peer communication. A receiving agent that declines to
act on it until a human confirms is behaving correctly, not defectively; this is the standard trust
boundary in every harness that has one. Pane injection is different: it lands as if the human
typed it, so it is the system's one **authoritative** channel. The mux plane is authoritative
*because* it is unforgeable by mail, but it is not authenticated: any local process that can write
to the multiplexer socket can also drive it. That boundary matters wherever the mux plane is
described as carrying orders.

Practically: never encode meaning in a `nudge` itself. A nudge only rings the pane. The payload
always lives in the mailbox (`mail send`, or the brief file `unit spawn` drops for a new unit).

## Placement is a concept, not a backend command

`unit spawn --at` names *where* a new session opens as a **placement concept**, and the mux layer
maps it onto whatever the live backend calls it. The concept nests four levels, **Session ›
Workspace › Tab › Pane**, and each backend names them differently. Watch the Tab row: what tmux
calls a "Window" is the **Tab** level, not a workspace.

| Concept | tmux | herdr |
| --- | --- | --- |
| **Session** | Session | Session |
| **Workspace** | (none) | Workspace |
| **Tab** | Window | Tab |
| **Pane** | Pane | Pane |

cyberlegion drives two backends (tmux, herdr) and exposes three levels: `pane:right` / `pane:down`
(**Pane**), `tab` (**Tab**, the default), `workspace` (**Workspace**). `--at` **defaults to `tab`**
to a new tab in the caller's current window, opened without stealing focus, so a spawned peer never
shrinks the caller's pane by splitting it. `tab` maps to each backend's native Tab primitive (tmux
`new-window -d`, herdr `tab create --no-focus`), never a split. tmux, having no Workspace level,
maps `workspace` onto its next-widest unit, a new Session. There is no `window` value, because "window" is
tmux's local name for the Tab concept, already covered by `tab`.

## Capabilities

| Node | Verbs | Owns |
|---|---|---|
| **mux** | doctor, mode (+ internal open/close/list/read/write/focus) | the pane abstraction over tmux/herdr |
| **unit** | register `--standing`, claim, whoami, who, prune, spawn, close, focus, nudge, read, clear | the instance registry + lifecycle |
| **mail** | send, inbox, read, ack, delete, await, watch, hook | the store + the universal return channel |
| **agent** | list, show, resolve, path | reusable definitions (the class) |
| **attach** | attach, `--clear`, `--show` | the human's read-pane (attention pointer) |
| **init** | init | onboarding: detect harness, wire hook, advise attach |
| **admin** | migrate | hub-state maintenance |

The most common verbs also answer at the top level, and a bare `cyberlegion` prints a status line. The [CLI Reference](/cyberlegion/cli/) lists them.

## Delegation and return: prefer wake over wait

Waiting holds a turn hostage. The legion already has wake paths: the surfacing hook injects a
reply on the next turn; the harness re-invokes you when a backgrounded subagent finishes. So
delegation is **fire-and-be-woken** by default; blocking with `mail await` is the fallback for
contexts with no hook.

| Backend | Who waits | Return channel | Return address |
|---|---|---|---|
| warm unit | CLI blocks on mail *(fallback)* | mail reply to the brief | inherent, since brief-mail carries `from` + `thread` |
| cold subagent · perf | harness (Task tool) | harness Task result, validated inline | none, the harness is the channel |
| cold subagent · uniform | woken by surfacing | mail, `--from <label>` | baked at spawn: one-way, no handshake |
| inline | nobody | in-hand | (none) |

**No round-trip handshake, ever.** The return address always rides one-way: inherent in the
brief-mail (warm), baked into the instruction at spawn (cold), or read from the worker's own
`spawnedBy`. The worker never asks where to reply.

## Routing judgment lives above the CLI

The CLI has no `dispatch` command group; deciding *how* to delegate is the Legate's one job. Given
an intent (fulfill a role with a brief, expect a verdict), it reads the target agent-definition's
`warm`/`interactive` tags and the environment's multiplexer availability, then picks exactly one
strategy: **channel** (a warm, interactive peer in its own pane), **run-inline** (no multiplexer to
host a peer), or **subagent** (a cold, one-shot unit realized via the caller's own Task tool). In an
attended session this runs in-session as the `dispatch-governance` skill; with no user channel it's
realized headless as the `headless-legate` agent. See [Skills](/cyberlegion/skills/) for how this surfaces to a
session.

## Invariants

1. **Identity is the mailbox.** Mail is keyed by agent id; `register` mints the id. A mailbox is
   intrinsic to being a unit, so there is no `mailbox create` verb. Mailbox lifecycle = unit
   lifecycle.
2. **Receiving requires registration; sending is free.** Resolving a recipient throws on an unknown
   *recipient*; any label may send. Reachable ⇒ registered unit; send-only ⇒ no identity needed
   (the cold subagent).
3. **Prefer wake over wait.** The surfacing hook and harness notification wake you; blocking is the
   fallback, never the spine.
4. **The return address rides one-way.** Reply-to-brief, bake-at-spawn, and `spawnedBy` lookup are all
   zero round-trips. The two-message handshake is never used.
5. **Mechanism is the CLI's; routing is the Legate's.** The CLI exposes the warm and cold/inline
   primitives but never *chooses* between them.

Together these mean the orchestrator itself must be a registered unit: a worker returns its result
addressed `to = <orchestrator id>`, delivery resolves that recipient or throws, and since
registration *is* mailbox creation, the orchestrator simply has to be registered: a session, or
`--standing` when it is headless with no pane.

## Related

- [The Spine](/cyberlegion/concepts/spine/): the agent / unit / pane nouns this architecture is built from
- [Mail Model](/cyberlegion/concepts/mail-model/): the mail plane in detail
- [CLI Reference](/cyberlegion/cli/): every command group this architecture organizes
