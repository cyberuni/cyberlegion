---
status: draft
project-path: packages/cyberlegion
---

# cyberlegion — the CLI: harness-agnostic agent spawn, messaging, and dispatch

> Root project spec — the **descriptive** top index for the `cyberlegion` **CLI** (the npm package at
> `packages/cyberlegion`). Behaviors live in the capability folders below.

`cyberlegion` is the metaphor-free foundation both SDD and the `cyberfleet` fleet-persona layer depend
**up** on: it spawns and reaps agent sessions, carries durable inter-agent mail, and provides the
result-slot primitives a caller uses to delegate work and await a verdict. It carries **no** fleet
metaphor and **no** SDD knowledge.

The CLI is **pure mechanism** — dumb hands a caller (the Legate routing brain, in the `cyberlegion`
plugin) composes. It never selects a backend and never invokes a harness subagent tool; routing
(warm-peer vs cold-subagent vs run-inline) is the caller's judgment.

State lives in a global hub at `~/.agents/cyberlegion/` (identity + mail + dispatch data, addressable
across project and worktree boundaries) plus a project-local `<project>/.agents/cyberlegion/` (tracked
marker only). A spawned unit's own git worktree checks out as a **sibling** of the primary checkout
(`<parent>/<repo>.worktrees/cyberlegion/<id>`), never nested inside the primary's own tree. All
mailbox + registry access goes through a domain `Store` interface (a `FileStore` impl today).

## Capabilities

| Node | Concern |
|---|---|
| [`identity/`](./identity/README.md) | self-identify and discover peers |
| [`session/`](./session/README.md) | warm peer session lifecycle over a multiplexer |
| [`mail/`](./mail/README.md) | durable inter-agent messaging |
| [`wake/`](./wake/README.md) | wake a peer — doorbell nudge, bounded await, hook surfacing |
| [`dispatch/`](./dispatch/README.md) | result-slot primitives for delegating work and awaiting a verdict |
| [`agent/`](./agent/README.md) | resolve reusable agent definitions |
| [`surfacing/`](./surfacing/README.md) | inject unread mail into a session across harnesses |

> Scaffold (`legion-scaffold`): nodes are placeholders; each is authored to a behavioral spec + suite
> by its own change request. See `flickering-pondering-rose` / `cyberlegion.design.md` for the plan.
