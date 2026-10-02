# Can cyberlegion work without harness hooks?

**Date:** 2026-10 · **Informs:** a follow-up change to `hooks/hooks.json`, `src/runtime/inject-inbox.ts`,
`src/install.ts` / `cyberlegion init`, the `init-cyberlegion` skill, and the `mail/surface` spec node.

The question: cyberlegion ships or installs harness hooks that surface mail into a session and nag a
root session to "bind this pane as the owner live presence". cyberfleet's Operator no longer binds
the owner to its pane — it registers its own handle and `unit claim`s the standing `operator` owner.
Is the hook still needed at all, and if it goes, what exactly is lost?

**Short answer.** Yes, cyberlegion works with no hooks. No primitive — spawn, brief pickup, mail,
doorbell, claim, await — requires one. Since ADR-0032 the hook only *surfaces* things. Removing it
loses four things: (1) unread mail shows up on its own at session start, (2) unread mail is
re-injected mid-turn on Write/Edit, (3) a root pane gets an identity automatically, and
(4) `lastSeen` is refreshed as a heartbeat. Only (1) has no hook-free equivalent, and only where no
doorbell can reach the human. The owner-binding nudge is now misleading and should go whatever else
is decided.

## Hook inventory

There is one hook program, `cyberlegion mail hook --event <E>` (`src/cli.ts`, which calls
`injectInbox` in `src/runtime/inject-inbox.ts`). How it gets wired differs by harness:

| Harness | Who wires it | Where | Events | Command |
| --- | --- | --- | --- | --- |
| Claude Code | the plugin | `hooks/hooks.json`, named by `.claude-plugin/plugin.json` | `SessionStart`; `PostToolUse` (matcher `Write\|Edit`) | `node "${CLAUDE_PLUGIN_ROOT}/bin/cyberlegion.mjs" mail hook --event <E>` |
| Codex | the plugin | the same `hooks/hooks.json`, named by `.codex-plugin/plugin.json` | `SessionStart`; `PostToolUse` | same command. **Unverified:** whether Codex sets `CLAUDE_PLUGIN_ROOT` for plugin hooks. If it doesn't, this hook already fails silently on Codex. |
| Cursor | `cyberlegion init` (`src/install.ts`) | the project's `.cursor/hooks.json` | `sessionStart` only (Cursor has no PostToolUse) | `if command -v cyberlegion …; then cyberlegion mail hook --event SessionStart; else npx -y cyberlegion[@pin] mail hook …; fi` |
| Claude Code / Codex, project level | `cyberlegion init` | `.claude/settings.json`, `.codex/hooks.json` | — | init writes none. It **removes** a project copy an earlier init wrote, because the plugin's copy would make it fire twice. |
| Copilot / others | nobody | — | — | no hook. `install()` rejects any harness outside `claude \| cursor \| codex`. |

What `mail hook` does on every fire:

1. `touch(ctx)`: bumps the caller's `lastSeen`.
2. If the caller has no identity and is in a mux pane, it auto-registers it (`register(ctx, {})`).
3. Output is one `hookSpecificOutput.additionalContext` built from up to three sections, in order:
   - `## Unread mail (N)`: the caller's own unread mail, bodies included. It is never acked, so it
     comes back on every fire.
   - `## Owner mail — <handle> (N)`: the unread mail of every standing owner. This section appears
     only in a root session (no `spawnedBy`), and only in the bound main pane when one is bound. With
     no main pane bound, every root session gets it.
   - `## Legion setup`: the nudge "This pane has no owner inbox bound yet — run `cyberlegion init` to
     register the surfacing hook and bind this pane as the owner live presence". It goes to a root
     session in a pane when no main pane is bound, or to a root session outside any pane when no
     standing owner exists.
4. If nothing accumulated, it prints nothing and exits 0. It never fails the harness turn.

It carries **no brief**. ADR-0032 retired that branch: the spawn wake rings `Read your brief at
<path>, then begin work.` straight into the new pane (`src/console/doorbell.ts` `spawnDoorbell`).

## Who relies on each job

| Job | Relied on by | Evidence |
| --- | --- | --- |
| Spawned unit's brief pickup | **nobody, any more** | ADR-0032; `inject-inbox.ts` header; `session.ts` `spawnAndWake`. cyberfleet's Operator skill (0.4.0) still says the new Pod "reads it through its own SessionStart hook". That text is stale. |
| Own unread mail at session start | a session resuming after mail arrived while it was down | `mail/surface` spec; the `legate` skill also reaches the same mail through `mail inbox` |
| Own unread mail on Write/Edit (PostToolUse) | a busy unit that gets mail mid-turn (Claude Code / Codex only) | `hooks/hooks.json`; `.research/agent-session-wake` path **E**, described there as a "cheap complement, not a primary wake" |
| Owner mail into a root session | `relay-governance`: a frameless or cron agent's report "surfaces into the human's next root session". `manage-inbox` describes the same push. | `skills/relay-governance/SKILL.md` §report; `skills/manage-inbox/SKILL.md` |
| Auto-register a root pane | a fresh root pane that never ran `unit register`. It then gets (a) a `spawnedBy` on the units it spawns, (b) `mail await`/`inbox` working without a register step, and (c) a pane record, so a doorbell can ring it. | `inject-inbox.ts`; `session.ts:223` sets `spawnedBy` only when the spawner resolves an id; `requireSelf` fails otherwise |
| `lastSeen` heartbeat | `unit prune`. It marks any non-standing record `exited` once `lastSeen` is more than 15 min old, **even when its pane is alive**. | `identity.ts` `prune`, `STALE_MS` |
| Setup nudge | `init-cyberlegion` onboarding, which mints the standing `legate` owner and runs `attach` | `inject-inbox.ts`; `skills/init-cyberlegion/SKILL.md` steps 4–5 |

`spawnedBy` has one consumer: the two root-session gates inside `inject-inbox.ts`. Nothing else
reads it.

## Without hooks: replacement and what is lost

| Capability | Hook-free replacement | What is genuinely lost |
| --- | --- | --- |
| **Brief pickup** | Already hook-free: the spawn wake names the brief path (ADR-0032). | Nothing. |
| **Own unread mail at session start** | The `mail send` doorbell rings a live recipient's pane right away (`wakeRecipient`). Bare `cyberlegion` prints `unread: N` and points to `mail inbox --unread`. The `legate` skill runs `mail inbox` when asked. | Mail that arrived while the session was **down** isn't shown automatically when it comes back. The ring went to a dead pane, and nothing replays it. The session sees it only when it, or its user, checks. |
| **Own unread mail mid-turn (PostToolUse)** | The doorbell, typed into the busy pane. A harness that queues typed input mid-turn (Claude Code does) takes it as the next turn. Otherwise the ring is a best-effort warning, and the mail waits for the unit's next `mail inbox`. **Not verified:** whether a mid-turn ring passes `nudge`'s submit-verify on each harness. | Mid-turn steering latency on Claude Code / Codex: a busy unit now sees new mail at the end of its turn, not during it. Cursor never had this. Against it: the hook re-injects **every** unread message on **every** Write/Edit until it's acked, and pays a node cold start per edit. The cost is real and recurring. |
| **Owner mail into the human's session** | (a) A **claimed presence**: a standing owner's mail rings its claimed unit's pane, and Operator reads `mail inbox --owner operator --unread` on connect. (b) The bound main pane: the doorbell falls back to it, focus-gated. (c) `manage-inbox` on demand. | **Unattended surfacing where no doorbell can reach**: no mux at all (a plain Cursor or Claude Code window); a mux session where nobody has claimed the owner and no main pane is bound; or the human wasn't focused on the main pane, so the doorbell was skipped. In these cases a headless report sits in the durable inbox until someone asks. Nothing is dropped, because delivery is durable, but no one is prompted. This is the **only** job with no hook-free equivalent. |
| **Auto-register a root pane** | Lazy registration in the CLI: when `requireSelf` runs in a live pane with no identity, run the same best-effort `register` the hook runs. `who --reconcile` already adopts herdr panes. | Done lazily, nothing is lost for any session that calls the CLI. A root pane that never touches the CLI stays unregistered, so it isn't doorbell-addressable. That doesn't matter, because nothing can address it by handle anyway. Units spawned from an unregistered root get no `spawnedBy`. That's harmless once the hook (its only consumer) is gone. Call it `spawn`'s job to lazily register the spawner too, so `spawnedBy` stays truthful. |
| **`lastSeen` heartbeat** | Every CLI call already bumps it (`requireSelf`, `touch`). | A unit that works more than 15 min without calling the CLI goes stale and `unit prune` exits it, which strands its handle. The PostToolUse heartbeat only hid this, and only on Claude Code / Codex while the unit was editing: an idle unit at its prompt goes stale either way, and so does every Cursor unit. The real fix is independent of hooks: don't stale-prune a record whose pane the mux reports live. |
| **Setup nudge** | `init-cyberlegion` and Operator's own connect step, which already fails loud and routes to `init-cyberlegion` when the standing `operator` owner is missing. | Nothing worth keeping. See below. |

## The owner-binding nudge is now misleading

On a cyberfleet hub, an Operator never runs `attach`. It registers its own handle and claims
`operator`. So in a mux, `getMainPane()` stays unset forever and the nudge fires on **every root
session's start, in every pane, indefinitely**, including the Operator's own session. Each part of
the nudge is wrong there:

- **It names the wrong command.** It says `cyberlegion init` will "bind this pane". `init` binds
  nothing: it wires hooks and prints a `nextStep` suggesting `attach`. On Claude Code and Codex, init
  doesn't even register a hook ("provided by plugin").
- **It pushes the obsolete model.** Binding a main pane makes that one pane the owner-mail gate and
  the doorbell's fallback. A fleet routes owner mail through the claimed presence instead.
  `wakeRecipient` rings the presence first and uses the main pane only when no presence is claimed.
- **Its signal means the wrong thing.** "Onboarding incomplete" is computed from "no main pane
  bound", but on a fleet hub, onboarding is complete when a standing owner exists and is claimed. The
  non-mux branch (no standing owner) is closer to right, and Operator's connect step already covers
  it, failing loud.
- **It's noise injected into model context.** The nudge is text the model reads every session, so
  it invites an agent to "helpfully" run `init` or `attach` and rebind the hub. That's exactly the
  binding the fleet moved away from.

The owner-mail gate built on the same main pane is still *correct* without a binding: with no main
pane bound it surfaces in every root session (the "pre-onboarding fallback"). On a fleet hub that
fallback is just the permanent state.

## Recommendation: keep one hook, slimmed; remove the rest

**Remove now**, in two independent changes, because each stands on its own:

1. **The setup nudge.** It's dead weight on a fleet hub and misleading on a Legate-only one.
   `init-cyberlegion` stays the onboarding front door, reached when asked or when Operator routes to
   it.
2. **The PostToolUse hook.** Re-injecting all unread mail on every edit costs more than the
   mid-turn latency it saves, and the doorbell already rings the unit (confirm that a mid-turn ring
lands on Claude Code and Codex before shipping this). Fix the
   prune staleness rule in the same breath (see follow-ups), so this doesn't surface as units being
   exited mid-work.

**Keep, slimmed to surfacing only:** the `SessionStart` hook, carrying own unread mail and owner mail.
It is the only mechanism that prompts a human about a durable owner report when no doorbell can reach
them: no mux, no claimed presence, or an unfocused main pane. It costs one node process per session
start. Move its auto-register into the CLI so the hook stops being the only place identity starts.

**Removing *all* hooks** is viable once one of these holds: (a) the human's root session always has
a doorbell path to owner mail, meaning a mux plus a claimed presence, which is the cyberfleet setup;
or (b) the loss of unattended surfacing in non-mux sessions is accepted, with reports read through
`manage-inbox` / Operator's connect read. For a pure cyberfleet hub, (a) already holds, and the
SessionStart hook is redundant with Operator's connect read. Deciding whether to drop it for
everyone is a product call on how much the non-mux, Legate-only user matters. Either way it's cheap
to revisit: the hook is one manifest entry plus one command, so dropping it later costs little.

**Load-bearing vs cheap.** Removing the nudge and PostToolUse is cheap to undo. Moving
auto-register into the CLI changes when identities get minted, and should get its own spec scenario.
Fixing the prune staleness rule changes liveness semantics for every record, which is the most
load-bearing item here and needs its own CR.

## Follow-up changes

If the recommendation is accepted:

1. **Drop the setup nudge.** Delete the `## Legion setup` block in `inject-inbox.ts`, its
   scenarios in `.agents/spec/mail/surface/` (README use case and `.feature`), and its tests. Update
   the payload-order line ("own mail → owner mail → setup nudge").
2. **Drop PostToolUse.** Remove it from `hooks/hooks.json`, `HookEvent`/`EVENTS`, the `VENDORS`
   event maps in `install.ts`, and `plugin-hook.test.ts`. Keep `init`'s removal path matching
   `--event PostToolUse`, so a project hook an older init wrote gets cleaned up rather than left
   pointing at a rejected event. Update `.agents/specs/cyberlegion-plugin/mail-hook/`.
3. **Lazy auto-register in the CLI.** Make `requireSelf` (and `spawn`, for the spawner) run the
   best-effort pane auto-register. Then remove it from `inject-inbox.ts`, or keep it there as a
   harmless duplicate until step 5.
4. **Prune staleness** (separate CR): a record with a pane the mux reports live is not stale,
   whatever its `lastSeen`. Keep the 15-min timer for pane-less records only.
5. **(Optional, later) Drop SessionStart.** Delete `hooks/hooks.json` and the manifest `hooks`
   entries (rebuild the vendor manifests), `mail hook`, `inject-inbox.ts`, and `install.ts`. `init`
   becomes a cleanup-only pass that removes any init-written project hook, Cursor's included, then
   is retired. Rewrite the `relay-governance` §report line ("surfaces into the human's next root
   session") to name the doorbell and `manage-inbox`.
6. **Docs.** Update `init-cyberlegion` step 2 wording, the `legate` route table rows about "register
   the surfacing hook", and the website pages `cli/mail.md`, `cli/init.md`,
   `concepts/mail-model.md`, `getting-started/installation.md`.
7. **Upstream (cyberfleet).** The Operator skill's "reads it through its own SessionStart hook"
   should say the spawn wake names the brief path (ADR-0032).
8. **Verify Codex.** Check whether Codex sets `CLAUDE_PLUGIN_ROOT` for plugin hooks. If it doesn't,
   the Codex hook is already a silent no-op, and every claim above about Codex surfacing is moot
   today.
