---
name: session-adapter-governance
description: "Partial Skill: invoke by name only — the SessionAdapter conformance rule: a mutating op verifies its observable effect landed or fails loud, keyed on the op's effect class. Loaded by CRs and producers touching adapter operations. Not triggered by users directly."
user-invocable: false
---

# Session Adapter Governance

The ratified design rule for every `SessionAdapter` **mutating operation** — a call that drives the
multiplexer to change peer/session state (`send`, `submit`, `focus`, the `nudge` composite, the
`clear` injection, the mail-delivery doorbell). Ratified from doctrine entry 2 (drafted off the
cr150 nudge boot-race; ADR-0025 records the promotion):

> A mutating operation must **verify its observable effect actually took hold** before reporting
> success, and **fail loud** rather than report false success when it cannot. Never fire-and-forget.

Precedent: the cr150 boot-race — `unit nudge` was one atomic text+Enter send that reported success
regardless of whether the booting harness consumed the Enter, so the peer sat idle while the caller
believed it started. The fix (submit-then-verify-then-retry, throw on the cap) is the reference
pattern below. A mutating op implemented as a single send with no read-back is **non-conformant**:
it reports success it never observed.

## Scope

- **Bound:** every op that changes session state, and every **composite that reports success** to a
  caller. The verification duty sits on the composite — a raw primitive (`send`, `submit`) used
  *inside* a conformant verify loop is not itself required to verify; a raw primitive that alone
  backs a success report makes that op non-conformant.
- **Not bound:** read-only ops (`read`, `paneExists`, `listPanes`) — they change no session state.

## Effect classes — the rule is applied per class, never mechanically copied

Verification must match the op's **effect class**. Classify first; copying one op's verification
onto another without classifying is itself a conformance failure.

**Unconditional** — the effect is observable regardless of who is watching (nudge: was the input
consumed? clear: was the reset command taken as a turn?). **Verify on every invocation**, attended
or headless.

**Attach-relative** — the effect only exists when a client is **attached** (focus/beam: did the
view move? there is no view without a viewer). Verify **only when the precondition holds**. On a
headless/unattended spawn there is nothing to move: **"no attached client" is a legitimate no-op,
not a failure** — the op completes cleanly and reports the no-op. A naive unconditional read-back
applied to an attach-relative op **false-fails every headless spawn**; that verification is
non-conformant even though it "verifies".

**Verify-before is necessary but not sufficient** (for an unconditional effect). Resolving and
validating the target before issuing the change (resolve-or-throw) proves the target *existed*; it
does not prove the effect *landed*. A conformant unconditional op carries both: fail loud before
issuing against a target it cannot resolve, and verify (or fail loud) after issuing.

**Best-effort decorations** still verify. An op declared best-effort by contract (the delivery
doorbell: durable delivery already happened, the ring is opportunistic) runs the same
verify-and-retry path; what changes is the failure channel — a ring that never completes within the
cap surfaces as an **explicit warning on the result** instead of throwing, and never fails the
durable operation it decorates. Best-effort never licenses silent false success: `rung: true` is
reported only for a verified taken turn.

## Conformance ledger

Every current mutating op, its class, and its status. A CR that introduces or reshapes a mutating
op (or a composite over one) **declares its effect class and ships its class-matched verification
in the same CR**; a deferred verification is recorded here as an authorized follow-up, never left
implicit. Downstream CRs cite **this governance** as the authority for their per-op verification —
the rule binds by being loaded, not by being asserted in a peer relay.

| Op | Where | Effect class | Status |
|---|---|---|---|
| `nudge` | `src/console/nudge.ts` | unconditional (input consumed as a taken turn) | **Conformant — the reference pattern.** Submit-then-verify-then-retry: send once, read back the pane tail for staged text, flush with bare-Enter `submit` up to the cap, **throw** when the turn is never taken (#150 / PR #153). |
| `focus` | `src/console/session.tmux.ts`, `session.herdr.ts` | attach-relative (the attached client's view moved) | **Partial.** Verify-before shipped (resolve-or-throw on an unresolvable pane, PR #160). The land-verify (did the view move) and the no-attached-client clean no-op are **authorized follow-up** — the land-verify must gate on an attached client or it false-fails headless spawns. |
| `clear` | `src/session.ts` `clearUnit` | unconditional (reset command taken as a turn) | **Non-conformant on verify-after — authorized follow-up.** The reset command is resolved fail-loud *before* anything is sent (false-friend/unmapped harness throws with nothing injected), but the injection itself is a raw `adapter.send` fire-and-forget — the same boot-race swallow class nudge fixed. Fix: route the injection through the nudge verify path. |
| mail-delivery doorbell | `src/console/doorbell.ts` `wakeRecipient` | unconditional (doorbell delivered as a taken turn) | **Conformant under the best-effort contract.** Rings via `nudge`'s verify path; a ring that never completes surfaces as an explicit `warning` (never a throw, never a failed send); `--no-nudge`, an absent recipient pane, an unbound main pane, and a self-addressed send are legitimate no-ops. |
| raw `send` / `submit` | `src/console/session.*.ts` | primitives | Not individually bound — the duty sits on the composite that reports success. |
| `open` / `openInNewWorktree` / `teardown` | `src/console/session.*.ts` | unconditional (pane created / destroyed) | Backend-verified: the mux command itself fails loud and the returned pane id is the observable effect (`paneExists` / `listPanes` observe it). Classify explicitly at any CR that reshapes them. |
