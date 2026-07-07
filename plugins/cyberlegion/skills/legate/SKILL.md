---
name: legate
description: "Use this skill when you need to reach another agent session — send a message to a named peer or \"the pane on the right\", check your inbox, wait for a reply, spawn or close a peer session, or dispatch work to fulfill a role and get a verdict back."
---

# legate

The Legate — gateway skill for the Legion, the front door to agent session spawning, messaging, and dispatch.
It **classifies** the request and either runs the matching `cyberlegion` CLI call directly or hands
routing judgment to `dispatch-governance`. It is a **thin classifier**: it holds no production
logic, loads no other governance, and writes no state of its own.

> **Version pin.** Every invocation below reads `npx cyberlegion@<version> ...` — a placeholder.
> The package is not yet published to npm (`legion-publish` is a later CR in the extraction); until
> then, resolve the CLI from a workspace checkout (`packages/cyberlegion/bin/cyberlegion.mjs`) or
> whatever pinned version the project has declared. Never invent a version number.

## Doorbell vs mailbox

Two different primitives, never confused: a **nudge** (`session nudge <ref>`) is a dumb doorbell —
it rings a peer's pane and carries no content. The **payload always lives in the mailbox**
(`mail send`, or the brief/result files a dispatch allocates) — a peer that receives a nudge reads
its mail to learn *why* it was rung. Never encode meaning in a nudge itself; never skip the mailbox
because a nudge already fired.

## Classification map

| User intent | Handling |
|---|---|
| Send a message to a named peer, "the pane on the right", a claude/cursor peer | `npx cyberlegion@<version> mail send --to <handle>` (or `session nudge <ref>` first if the peer needs waking, then `mail send`) |
| Check inbox / read unread mail | `npx cyberlegion@<version> mail inbox` — `mail read <msg-id>` to peek, `mail ack <msg-id>` once handled |
| Spawn a new peer session | `npx cyberlegion@<version> session spawn --agent <name> ...` |
| Close / tear down a peer session | `npx cyberlegion@<version> session close <id>` |
| Wait for a threaded reply | `npx cyberlegion@<version> mail await --thread <id>` |
| Watch mail as it streams in (observer, never acks) | `npx cyberlegion@<version> mail watch` |
| List addressable peers | `npx cyberlegion@<version> identity who` |
| Sweep dead peers | `npx cyberlegion@<version> identity prune` |
| Set up the mail-surfacing hook / diagnose the environment | `npx cyberlegion@<version> admin install` / `admin doctor` |
| Dispatch work to fulfill a role with a brief and expect a verdict back (routing judgment needed — which strategy, which agent def, warm vs cold) | **hand off to `dispatch-governance`** — do not pick a `dispatch` subcommand yourself |
| No user channel at all (unattended trigger, multi-unit fan-out) | **spawn the `headless-legate` agent** by name — it realizes this same gateway + `dispatch-governance` flow headless |

## Load the handling skill in-session

For an attended session (a user or peer session holds this gateway), classify and act directly —
spawn nothing. The one exception is a **dispatch** intent: routing which strategy to use (warm
channel, cold subagent, or run-inline) is judgment this gateway does not carry — load
`dispatch-governance` in-session and let it decide.

**Headless (no user channel): spawn `headless-legate`.** When this gateway is reached with no live
user or peer channel to relay through — an unattended scheduler, a multi-unit fan-out — spawn the
`headless-legate` agent by name. It is not a separate role: it is this same classify-then-route flow,
realized headless, batching `needs-input` instead of asking live.

## Boundaries

This skill never talks to the filesystem or another session directly — every mechanic is a
`cyberlegion` CLI call. It never chooses a dispatch strategy itself (that is
`dispatch-governance`'s one job) and never invokes a harness's Task/subagent tool (that is the
caller's own tool, used only inside `dispatch-governance`'s subagent path via
`subagent-backend-governance`).
