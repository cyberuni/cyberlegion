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
- **a new identity / mail / session / dispatch-primitive CLI operation** → **not here** — that is
  the `cyberlegion` CLI project (`packages/cyberlegion`).
- **a cross-capability e2e** (spans both gateway and dispatch) → this project's own e2e; a future
  `acceptance/` node may formalize it.

## Owed

This spec skeleton was authored alongside the plugin build (CR `legion-gateway-legate`) without full
`.feature` suites. The `init/` node was specced and its `init-cyberlegion.feature` **frozen** by CR
`cyberlegion-plugin-init-skill` (spec gate passed, ALIGNED). `gateway/gateway.feature` and
`dispatch/dispatch.feature` remain owed follow-up work before either node can pass a spec gate. Root
`status: draft` reflects the project rollup — it advances to `approved` only once every node is
gated; per-`.feature` freeze is independent (only `init-cyberlegion.feature` is `@frozen` today).
