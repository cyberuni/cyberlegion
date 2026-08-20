---
title: The Spine
description: The three nouns behind every cyberlegion command — agent (definition), unit (instance), and pane (location).
---

Three distinct things sit behind every command: one is a template, one is a running thing, one is
where it runs.

| Noun | Is a… | What it is |
|---|---|---|
| **`agent`** | definition | a reusable template on disk (`.agents/agents/*.md`) — harness, model, instructions |
| **`unit`** | instance | a spawned, registered agent — its own record, its own inbox; the thing you address |
| **`pane`** | location | where a unit runs, over a multiplexer (tmux / herdr); managed by the `mux` layer |

An `agent` definition is inert — it names no running process. `unit register` (or `unit spawn`)
turns a session into an addressable instance with an identity and a mailbox. A `pane` is neither of
those: it is the multiplexer location a unit happens to occupy right now, and a unit can exist
(headless, `--standing`) with no pane at all.

This split is why the command groups are shaped the way they are — see [CLI:
agent](/cli/agent/) for the definition side and [CLI: unit](/cli/unit/) for the instance side.

## Related

- [Architecture](/concepts/architecture/) — how the spine sits inside the two-layer split
- [Mail Model](/concepts/mail-model/) — how a `unit`'s identity becomes a mailbox address
- [CLI: unit](/cli/unit/) · [CLI: agent](/cli/agent/) · [CLI: mux](/cli/mux/)
