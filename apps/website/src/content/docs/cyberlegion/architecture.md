---
title: CLI Architecture (target)
description: The re-aligned cyberlegion CLI — two layers (mux and legion), the agent→unit→pane spine, and the invariants that fall out of the mail model. A proposal that realigns the spec to the real architecture.
---

:::caution[Proposal — unratified]
This page describes the **target** architecture the CLI is being realigned to. The shipped surface is on the [Overview](/cyberlegion/overview/). This realignment supersedes the earlier `identity`/`presence` node split — it corrects a spec that was organized on an invented axis (`surfacing`, `wake`) that matched no command.
:::

The charter this is measured against, from the root spec: **the CLI is pure mechanism** — "it never selects a backend and never invokes a harness subagent tool; routing is the caller's judgment." Every call below is derived from holding the CLI to that line. The **Legate** (the plugin) is the routing brain.

## The spine — three nouns

The `identity? session? owner? agent?` tangle dissolves once these are kept distinct: one is a template, one is a running thing, one is where it runs.

| Noun | Is a… | What it is |
|---|---|---|
| **`agent`** | definition | a reusable template on disk (`.agents/agents/*.md`) — harness, model, instructions |
| **`unit`** | instance | a spawned, registered agent — its own record, its own inbox; the thing you address |
| **`pane`** | location | where a unit runs, over a multiplexer (tmux / herdr); managed by the `mux` layer |

## Two layers, one-way dependency

cyberlegion does two separable jobs. **Multiplexer management** (`mux`) is a unit-agnostic pane abstraction over tmux/herdr — you could run `btop` in a pane and never touch a unit. **Legion management** — units, mail, defs — is built *on* the mux. They ship together, but the dependency runs one way only: legion → mux, and the mux layer carries zero unit knowledge. `dispatch` (routing) sits a layer *above* legion, in the plugin.

```
plugin · Legate    dispatch  — warm/cold/inline routing, wake-vs-wait policy
      ▲ composes — the CLI never selects a backend
legion             unit · mail · agent(defs) · attach · init · admin
      ▲ depends on the pane abstraction (DIP)
mux                doctor · mode   (+ internal open/close/read/write/focus)
```

Only `doctor` / `mode` surface to a user; the rest is the abstraction the legion composes. `nudge` is *legion* — at the mux level it is just `write` (send-keys) with a doorbell meaning.

## Capabilities

The rule is **one node per command group, plus a node for each genuine architectural layer**. `mux` earns a node as a real dependency boundary; `surfacing`/`wake` never were layers — just bundles of `mail` verbs — so they dissolve.

| Node | Verbs | Owns |
|---|---|---|
| **mux** | doctor, mode (+ internal open/close/list/read/write/focus) | the pane abstraction over tmux/herdr |
| **unit** | register `--standing`, whoami, who, prune, spawn, close, focus, read, nudge | the instance registry + lifecycle |
| **mail** | send, inbox, read, ack, delete, await, watch, hook | the store + the universal return channel |
| **agent** | list, show, resolve, path | reusable definitions (the class) |
| **attach** | attach, `--clear` (`--follow` later) | the human's read-pane (attention pointer) |
| **init** | init | onboarding: detect harness, wire hook, advise attach |
| **admin** | migrate | hub-state maintenance |

Hot-path top-level aliases stay: `who` · `send` · `inbox` · `spawn` · bare-status.

## From today's commands

| Today | Change | Becomes | Why |
|---|---|---|---|
| `identity *` | rename | `unit *` | It was always the unit registry, not "identity". |
| `identity owner --handle` | fold | `unit register --standing` | A standing recipient is the sibling of `register`. |
| `identity who` + `session list` | merge | `unit who` | Two names for one list. |
| `identity bind-main` / `main` | rename | `attach` / `--clear` | Not a record — a presence pane. |
| `session spawn` / `close` | move | `unit spawn` / `close` | Unit lifecycle composes the mux; no "session" noun. |
| `session focus/read/nudge` | move | `unit focus/read/nudge` | `nudge` = legion over `mux.write`. |
| `admin doctor` / `mode` | move | `mux doctor` / `mode` | Multiplexer probes. |
| `admin install` | fold | `init` (+ `mail hook`) | Hook wiring is onboarding; `surfacing` dissolves here. |
| node `surfacing` / `wake` | dissolve | `mail` · `mux` | Never layers — just `mail` verbs + a mux probe. |
| `dispatch *` | to plugin | Legate | Routing is judgment; the CLI must not select a backend. |
| `dispatch prep`/`collect` + `Store.result` | drop | — | Dominated: Task-result wins on cost, mail wins on uniformity. |

## Delegation & return — prefer wake over wait

Waiting holds a turn hostage. The legion already has wake paths — the surfacing hook injects a reply on the next turn; the harness re-invokes you when a backgrounded subagent finishes. So delegation is **fire-and-be-woken** by default; `--wait` / `await` is the demoted fallback for no-hook contexts.

| Backend | Who waits | Return channel | Return address |
|---|---|---|---|
| warm unit | CLI blocks on mail *(fallback)* | mail reply to the brief | inherent — brief-mail carries `from` + `thread` |
| cold subagent · perf | harness (Task tool) | harness Task result — free, validate inline | none — the harness is the channel |
| cold subagent · uniform | woken by surfacing | mail, `--from <label>` | baked at spawn — one-way, no handshake |
| inline | nobody | in-hand | — |

**No round-trip handshake, ever.** The return address always rides one-way: inherent in the brief-mail (warm), baked into the instruction at spawn (cold), or read from the worker's own `spawnedBy`. The worker never asks where to reply.

## The mail model, in email terms

`to` and `thread` are different fields with different jobs — one is the envelope address, one is the conversation the machine matches on. The reply carries both: `to` so it arrives, `thread` so it's recognized among many in flight.

| Email | cyberlegion | Role |
|---|---|---|
| To: | `to` | **Address** — which mailbox (`resolveRecipient` → agent id) |
| Subject: | `subject` | human title (optional) |
| Message-ID | `id` | this message's unique id |
| In-Reply-To | `replyTo` | "this answers message X" |
| References | `thread` | **Correlation** — a minted unique token; `await --thread t` matches exactly this exchange |

A subject can collide; a minted thread cannot.

## Invariants

1. **Identity is the mailbox.** Mail is keyed by agent id; `register` mints the id. A mailbox is intrinsic to being a unit — there is no `mailbox create` verb, ever. Mailbox lifecycle = unit lifecycle.
2. **Receiving requires registration; sending is free.** `resolveRecipient` throws on an unknown *recipient*; any label may send. Reachable ⇒ registered unit; send-only ⇒ no identity needed (the cold subagent).
3. **Prefer wake over wait.** The surfacing hook and harness notification wake you; blocking is the labeled fallback, never the spine.
4. **The return address rides one-way.** Reply-to-brief, bake-at-spawn, or `spawnedBy` lookup — all zero round-trips. The two-message handshake is never used.
5. **Mechanism is the CLI's; routing is the Legate's.** The CLI exposes the warm and cold/inline primitives but never *chooses* between them.

:::note[Proof — the orchestrator needs a mailbox]
A worker returns its result with `to = <orchestrator id>`. Delivery runs `resolveRecipient(to)`, which **throws on an unknown recipient — no partial write**. So for any reply to be deliverable, the orchestrator must resolve as a registered recipient. And since registration *is* mailbox creation, the orchestrator simply has to be a registered unit — a session, or `--standing` when it is headless with no pane. ∎
:::

## Deferred (written down, not this change)

- **`attach --follow`** — auto-move the read-pane via tmux focus-events; the attention pointer made automatic. Manual stays the default.
- **`mail read` / `await --verdict-schema`** — validate a result on receive, where the dropped `collect`'s schema check now lands.
