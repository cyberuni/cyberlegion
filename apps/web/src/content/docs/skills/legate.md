---
title: 'Skill: legate'
description: What the legate skill does, what it hands off to routing judgment, and what it leaves to the CLI.
---

`legate` is the gateway skill for the Legion — the front door to agent session spawning,
messaging, and dispatch. It is a **thin classifier**: it holds no production logic itself, loads
no other governance except `dispatch-governance`, and writes no state of its own. It classifies the
request and either runs the matching [`cyberlegion` CLI](/cli/) call directly, or — for a dispatch
intent — hands routing judgment off.

## Run it

```text
/cyberlegion:legate
```

It also triggers on prose: "send a message to that peer," "check my inbox," "spawn a reviewer
session," "wait for a reply on that thread," or "dispatch this to fulfill the reviewer role."

## Doorbell vs mailbox

Two different primitives, never confused: a **nudge** (`unit nudge <ref>`) is a dumb doorbell — it
rings a peer's pane and carries no content. The **payload always lives in the mailbox** (`mail
send`, or the brief file `unit spawn` drops for a new unit) — a peer that receives a nudge reads
its mail to learn *why* it was rung. `legate` never encodes meaning in a nudge itself, and never
skips the mailbox because a nudge already fired. See [Mail Model](/concepts/mail-model/).

## Classification map

| User intent | Handling |
|---|---|
| Send a message to a named peer, "the pane on the right", a claude/cursor peer | `mail send --to <handle>` (or `unit nudge <ref>` first if the peer needs waking) |
| Check inbox / read unread mail | `mail inbox` — `mail read <msg-id>` to peek, `mail ack <msg-id>` once handled |
| Spawn a new peer session | `unit spawn --agent <name> ...` |
| Close / tear down a peer session | `unit close <id>` |
| Wait for a threaded reply | `mail await --thread <id>` |
| Watch mail as it streams in (observer, never acks) | `mail watch` |
| List addressable peers | `unit who` |
| Sweep dead peers | `unit prune` |
| Onboard / set up cyberlegion | invoke the [`init-cyberlegion` skill](/skills/init-cyberlegion/) |
| Diagnose the environment | `mux doctor` |
| Register the surfacing hook by hand | `init --agent <harness>` (`init-cyberlegion` wraps this) |
| Dispatch work to fulfill a role and expect a verdict back | hand off to `dispatch-governance` |
| No user channel at all (unattended trigger, multi-unit fan-out) | spawn the `headless-legate` agent by name |

## Load the handling skill in-session

For an attended session, `legate` classifies and acts directly — it spawns nothing. The one
exception is a **dispatch** intent: routing which strategy to use (warm channel, cold subagent, or
run-inline) is judgment this gateway does not carry, so it loads `dispatch-governance` in-session
and lets it decide.

**Headless (no user channel):** when this gateway is reached with no live user or peer channel to
relay through, it spawns the `headless-legate` agent by name — the same classify-then-route flow,
realized headless, batching `needs-input` instead of asking live.

## Rules the skill follows

- Every mechanic is a `cyberlegion` CLI call — it never talks to the filesystem or another session
  directly.
- It never chooses a dispatch strategy itself; that decision belongs entirely to
  `dispatch-governance`.
- It never invokes a harness's Task/subagent tool directly — only `dispatch-governance`'s subagent
  path does, via `subagent-backend-governance`.

## What it will not do

`legate` will not compose `unit spawn` + `mail await` + a Task tool call itself for a dispatch
intent — that composition is `dispatch-governance`'s job, not a shortcut this gateway takes.

## Related

- [CLI: unit](/cli/unit/) · [CLI: mail](/cli/mail/) · [CLI: mux](/cli/mux/) — the commands this
  skill classifies into
- [Skill: init-cyberlegion](/skills/init-cyberlegion/) — where onboarding intent is routed
- [Skill: manage-inbox](/skills/manage-inbox/) — the human's owner-mailbox surface, distinct from
  this skill's session-scoped mail handling
