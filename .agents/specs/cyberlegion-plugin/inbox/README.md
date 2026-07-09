---
spec-type: behavioral
concept: [mail, identity]
---

# inbox — the `manage-inbox` owner-mailbox skill

The human's surface for the **owner mailbox**: the hub-level, session-independent inbox a standing
`legate` owner identity holds, where frameless agents (cron-started, no parent frame) push their
reports (`dispatch/`'s `relay-governance` lifecycle). `manage-inbox` wraps the `cyberlegion` CLI's
owner-scoped mail commands so a human roaming across sessions manages the one owner mailbox from
wherever they are. It is a **thin wrapper**: every mechanic is a `cyberlegion` CLI call; it decides
nothing about routing or dispatch and writes no state beyond the ack/reply the human directs.

## Placement note (backfilled by the formation pass)

This node was added by a post-mission formation pass following CR `cyberlegion-plugin-init-skill`:
the `manage-inbox` skill already shipped under `plugins/cyberlegion/skills/manage-inbox/` and is
already named by both `gateway/README.md`'s non-goals and `init/README.md`'s trigger-disambiguation
(and its own `.feature`'s routing-defer scenario), but carried no owning node in this project's
capability map — an untagged orphan. The split from `gateway/`/`init/`/`dispatch/` is purely
placement (which existing skill's behavior this node covers); no new design decision, no scenario
authored here, coverage-preserving by construction (there is no scenario to narrow — the skill and
its own `.feature` already exist unchanged in the plugin). Self-cleared under the Warden's
reversible/derivable/low-blast class; provisional until the Council ratifies the trail.

## Use Cases

**Subject** — the human's own on-demand review of the standing owner mailbox: resolving the owner
handle, listing what is waiting, reading a report without consuming it, acking it once handled, and
replying on a report's thread to answer a frameless agent's question.

**Non-goals** — routing or dispatch judgment (that is `gateway/` / `dispatch/`); onboarding /
binding the owner identity in the first place (that is `init/`); a session's own (non-owner) inbox
(the plain `mail inbox`/`read`/`ack`, out of scope for this skill and this node); the CLI mechanics
themselves (`identity owner`, `mail inbox`/`read`/`ack`/`send` — the sibling `packages/cyberlegion`
project).

| Use case | Trigger | Inputs | Outcome |
|---|---|---|---|
| **resolve the owner handle** | any owner-inbox request | `$CYBERLEGION_OWNER` or the standing owner list | the one standing handle to scope every other call to |
| **list what is waiting** | "check my inbox", "any reports for me" | `--unread` optional | aggregate `<N> messages (<U> unread)`, oldest-first |
| **read without consuming** | "what did the agent send", "read that report" | a message id | the report body; message stays unread until acked |
| **ack — the only read-state change** | "mark it read", "clear my owner inbox" | a message id | exactly one success even under two concurrent acks; acking an unknown/already-acked id errors |
| **reply on a report's thread** | acting on a surfaced owner-mail doorbell that is a question | a thread id + answer body | the frameless agent's next tick picks up the answer |

## Owed

Specced alongside this placement backfill without a `.feature` — same owed state as `gateway/` and
`dispatch/` (CR `legion-gateway-legate`). A future CR authors `inbox/inbox.feature` from the use
cases above; root `status: draft` is unaffected either way (project rollup, independent of any
single node's freeze).
