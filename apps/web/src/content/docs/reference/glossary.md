---
title: Glossary
description: Terms used across the cyberlegion docs, including agent, unit, pane, hub, owner, legate, and dispatch.
---

| Term | Meaning |
|---|---|
| **Legion** | The whole system: every addressable unit sharing one hub, across harnesses. |
| **agent** | A definition: a reusable template on disk (`.agents/agents/*.md`) naming harness, model, and instructions. See [The Spine](/cyberlegion/concepts/spine/). |
| **unit** | An instance: a spawned, registered agent with its own record and mailbox; the addressable thing. |
| **pane** | A location: where a unit runs, over a multiplexer (tmux or herdr); managed by the `mux` layer. |
| **hub** | The shared root state lives under (`$CYBERLEGION_ROOT`, else the global hub): agents, mail, briefs. |
| **owner** | A standing, session-independent identity that holds the durable owner mailbox frameless agents report into. |
| **standing** | A unit kind minted with `unit register --standing`: an identity independent of any one session. |
| **Legate** | The routing brain built on top of the CLI. Decides *how* to reach a peer. Shipped as the plugin and its `legate` skill. |
| **dispatch** | Fulfilling a role with a brief and expecting a verdict back. The judgment `dispatch-governance` carries, never the CLI. |
| **channel / run-inline / subagent** | The three dispatch strategies `dispatch-governance` picks between: a warm interactive peer, doing the work in-session, or a cold one-shot unit via the Task tool. |
| **mail plane** | The peer, non-authoritative communication channel, built on durable inbox files. See [Mail Model](/cyberlegion/concepts/mail-model/). |
| **mux plane** | The authoritative communication channel: keystrokes injected into a peer's pane, indistinguishable from the human typing. |
| **nudge** | A doorbell: it rings a peer's pane and carries no content of its own. |
| **thread** | A minted, unique correlation token distinguishing one conversation among many in flight; distinct from `subject`, which can collide. |
| **TOON** | The default, token-efficient tabular output format every command emits; `--format json` is the alternative. |

## Related

- [The Spine](/cyberlegion/concepts/spine/): agent / unit / pane in depth
- [Mail Model](/cyberlegion/concepts/mail-model/): mail plane terms in depth
- [Architecture](/cyberlegion/concepts/architecture/): mux plane and dispatch strategy terms in depth
