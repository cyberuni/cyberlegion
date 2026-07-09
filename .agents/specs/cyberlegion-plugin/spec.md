---
status: draft
project-path: plugins/cyberlegion
name: cyberlegion-plugin
---

# cyberlegion-plugin — the Legion's gateway and Legate (agent behavior)

> Root project spec — the **descriptive** top index for the `cyberlegion` **plugin** (the
> marketplace distribution at `plugins/cyberlegion`). Behaviors live in the capability folders
> below. The deterministic engine — the `cyberlegion` CLI — lives in the sibling `packages/cyberlegion`
> package and is not tracked by this spec (mirrors the `cyberfleet` / `cyberfleet-plugin` split: CLI
> mechanics vs. plugin persona/routing behavior are two packages, two deploy targets, two specs).

## What this is

The `cyberlegion` plugin ships the **routing-brain layer** on top of a deliberately dumb CLI: a
gateway skill that classifies a request (send mail, check inbox, spawn/close a peer, dispatch work)
and a governance pair that decides — for a dispatch intent — whether to run a warm interactive
peer, a cold one-shot subagent, or the work inline in the caller's own session. Both realizations
(attended, in-session vs. headless, spawned) run the identical procedure; the plugin carries no
separate headless design.

## Why this is its own project

Same three axes as `cyberfleet-plugin`: artifact-type (agent behavior vs. deterministic script),
deploy target (marketplace vs. npm), and package (`plugins/cyberlegion` vs. `packages/cyberlegion`).
The CLI is intentionally mechanism-only (per the design doc's "CLI = pure mechanism; the Legate =
routing brain" split) — it never auto-routes, never invokes a Task tool, never decides warm vs.
cold. All of that judgment lives here, in this plugin, so it stays swappable without touching the
published CLI's contract.

## Capability map

| Folder | Type | What |
|---|---|---|
| [`gateway/`](./gateway/README.md) | behavioral | the `legate` skill — thin classifier front door; loads no governance, writes no state |
| [`dispatch/`](./dispatch/README.md) | behavioral | the routing brain (`dispatch-governance` in-session, `headless-legate` headless) — resolves warm/interactive tags + multiplexer availability into exactly one of channel / run-inline / subagent, and the `subagent-backend-governance` procedure for the subagent path |
| [`init/`](./init/README.md) | behavioral | the `init-cyberlegion` onboarding skill — a thin CLI wrapper that probes the environment, registers the surfacing hook, and (root-only, on an explicit yes) binds this pane as the durable `legate` owner inbox |
| [`inbox/`](./inbox/README.md) | behavioral | the `manage-inbox` skill — the human's on-demand surface for the standing owner mailbox (list/read/ack/reply) |

## Placement map

Where a new concept lives — slot here, do not invent placement:

- **a new user-facing intent the gateway should recognize** (a new kind of mail/session/identity
  request) → `gateway/` — extend the classification map, never add production logic to the gateway
  itself.
- **a new routing rule** (a new tag combination, a new strategy, a change to how warm/interactive/
  mux resolve to a strategy) → `dispatch/` — this is the one place that judgment is allowed to live.
- **a new headless-only concern** (how the Legate batches needs-input, fan-out concurrency caps) →
  `dispatch/` as well — the headless realization is one behavior with the in-session one, not a
  separate capability.
- **a new onboarding / setup intent** (registering the surfacing hook, binding the main owner pane,
  first-run environment probing) → `init/` — the user-facing `init-cyberlegion` skill; keep every
  mechanic a CLI call, never add production logic here.
- **a new owner-mailbox review intent** (listing, reading, acking, or replying to owner mail once
  bound) → `inbox/` — the user-facing `manage-inbox` skill; never add routing/dispatch judgment here.
- **a new identity / mail / session / dispatch-primitive CLI operation** → **not here** — that is
  the `cyberlegion` CLI project (`packages/cyberlegion`).
- **a cross-capability e2e** (spans both gateway and dispatch) → this project's own e2e; a future
  `acceptance/` node may formalize it.

## Owed

This spec skeleton was authored alongside the plugin build (CR `legion-gateway-legate`) without full
`.feature` suites. The `init/` node was specced and its `init-cyberlegion.feature` **frozen** by CR
`cyberlegion-plugin-init-skill` (spec gate passed, ALIGNED). `gateway/gateway.feature`,
`dispatch/dispatch.feature`, and the `inbox/` node backfilled below remain owed follow-up work before
their nodes can pass a spec gate. Root `status: draft` reflects the project rollup — it advances to
`approved` only once every node is gated; per-`.feature` freeze is independent (only
`init-cyberlegion.feature` is `@frozen` today).

**Formation-pass note (post `cyberlegion-plugin-init-skill`).** Two structural observations from the
post-mission formation pass: (1) `inbox/` was backfilled above — the shipped `manage-inbox` skill had
no owning node (an untagged orphan self-cleared by placement only, no scenario authored); (2) the
`init`/`spec` and `init`/`impl` gate lines for CR `cyberlegion-plugin-init-skill` had been appended to
a stray root-level `ledger/` directory instead of this project's own sibling `ledger/` (a landed
concurrent commit, not this pass's mission) — relocated in-session via a zero-content-delta move to
`ledger/cyberlegion-plugin-init-skill.6a31c8.jsonl` here; self-cleared (pure structural relocation,
no line rewritten, no verdict changed).
