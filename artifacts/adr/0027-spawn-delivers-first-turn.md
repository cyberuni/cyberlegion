# ADR-0027: `unit spawn` delivers the spawned peer's first turn

## Status

Accepted

## Context

Operator and Pod (and the Legate's `channel` dispatch strategy) spawn peer sessions with a bare
`cyberlegion unit spawn`. A freshly-spawned **paned** agent (herdr/tmux) boots to an **idle prompt**:
its brief is injected into context by its own SessionStart hook, but the model **takes no turn** — it
sits frozen, brief unread, until a human manually rings `unit nudge`. The personas never do this (the
word "nudge" appears nowhere in `operator/SKILL.md`), so spawned pods hang at $0.00. Confirmed live
(issue #188, #185): spawning a pod then `unit nudge` returned `resubmits: 1` — the initial submit was
swallowed by the booting harness and recovered by one flush. That is the boot race, reproduced.

**Root cause.** For a paned agent, **payload-delivery** (the brief-file drop) and **turn-delivery** (a
taken turn) are two separate acts. The spawn path only did the first — it treated the brief-file as
sufficient, the way it is for a *subagent* (where the caller's harness Task call itself is the turn).
But `unit spawn` never opens a subagent; it always opens a real session that boots idle. So a turn
must be delivered after the pane comes up. Turn-delivery existed in only two places, both bypassed by
a bare spawn: `mail send`'s auto-ring (`wakeRecipient`), and `dispatch-governance`'s `channel`
wake-matrix mode "B" (which fires only behind a verified mux — its mode-A path booted idle too).

## Decision Drivers

- The fix must reach **every** paned caller at once (Operator, Pod, `channel`), without a persona
  change and without each caller re-implementing a doorbell.
- The `cyberlegion` CLI charter (`packages/cyberlegion/.agents/spec/spec.md`) is **pure mechanism /
  dumb hands** — it never selects a backend or carries routing judgment. `dispatch` as a CLI verb was
  dissolved (CR-4, ADR-0024, #185/#186); this must not revive it.
- The `nudge` primitive is already boot-race-aware (submit → verify the turn was taken → bare-Enter
  re-flush up to a cap → throw). The fix should reuse it, not fork it.
- Turn-delivery is **best-effort**: a spawn that opened a worktree, session, and registry record must
  not fail because a doorbell could not complete.

## Considered Options

### Option A: Route personas through the dispatch seam

Operator/Pod state a dispatch intent to `legate` → `dispatch-governance` → `channel`, and make
turn-delivery **mandatory** in `channel` (not gated to wake-matrix mode B).

- **Pros**: keeps turn-delivery adjacent to the existing wake-matrix.
- **Cons**: heavier — pulls routing into the persona flow for what is a mechanism concern; leaves
  bare `unit spawn` (used directly all over) still booting idle; does not fix a `--cwd` or scripted
  spawn that never goes through the Legate.

### Option B: Turn-delivery in the `unit spawn` primitive (chosen)

`unit spawn` delivers the turn itself when it opens a paned session — spawn → boot-race-aware doorbell
(reuse `nudge`), best-effort exactly like `mail send`'s auto-ring, with a `--no-wake` opt-out
mirroring `mail send --no-nudge`.

- **Pros**: mechanism, not routing judgment — it *completes* the spawn, it does not select a backend,
  so it stays within the dumb-hands charter. Fixes all callers at once (Operator, Pod, and every
  `channel` sub-mode including mode-A) with no persona change. One home for the behavior.
- **Cons**: a fresh `channel` spawn now delivers its own turn, so `dispatch-governance`'s mode-B
  `unit nudge` becomes a redundant second ring (a minor inefficiency, deferred — see below).

## Decision

Adopt **Option B**. `unit spawn` rings a best-effort **first-turn doorbell** (`SPAWN_DOORBELL`) against
the freshly-opened pane over the same `nudge` submit-verify path, with a wider retry budget than a
`mail send` doorbell to tolerate a cold harness boot. The ring is opportunistic on top of the
guaranteed spawn effect (worktree + session + registry record): `--no-wake` rings nothing, and a ring
that never completes within the budget is swallowed into a stderr **warning**, never a failed spawn —
the same best-effort contract as `wakeRecipient`. The spawn result carries a `rung` field. This is a
CLI **mechanism** addition: it selects no backend and revives no `dispatch` verb.

The behavior is frozen as four additive scenarios on `unit/lifecycle/lifecycle.feature` (CR
`github-188-spawn-delivers-turn`): the first-turn ring, the boot-race re-submit (delivered exactly
once), the best-effort no-fail warning, and the `--no-wake` opt-out.

## Consequences

- **Contract shift.** `unit spawn`'s postcondition now includes a delivered first turn on a paned
  spawn (best-effort). Callers that want the old idle-boot behavior pass `--no-wake`.
- **The wake-matrix is now partly redundant.** `dispatch-governance`'s `channel` mode-B `unit nudge`
  double-rings a *fresh* channel spawn (spawn already delivered the turn), and its mode-A path no
  longer boots idle. The frozen `dispatch.feature` wake-matrix scenarios remain **true** (they
  describe reaching a peer's pane, orthogonal to spawn's own ring), so this CR does **not** re-open
  them. Reconciling the wake-matrix to lean on spawn's turn-delivery is filed as a **follow-up CR**.
- **Out of scope, recorded not built:** a **warm agent pool** (mail + doorbell an existing idle unit
  instead of spawning) and a **`--visible` axis** (force a paned session for a cold one-shot a human
  wants to watch — paned-vs-subagent is derived today from `warm × interactive × mux`).

## References

- Issue cyberuni/cyberplace#188
- ADR-0024 (dispatch CLI node alignment / dissolution), #185/#186 (dispatch charter reconcile)
- ADR-0025 (SessionAdapter verify-effect-or-fail-loud — the `nudge` boot-race primitive this reuses)
