# ADR-0032: The spawn wake carries the brief instruction

## Status

Accepted — supersedes [ADR-0027](0027-spawn-delivers-first-turn.md).

## Context

ADR-0027 established that `unit spawn` must deliver the spawned peer's **first turn**: a paned agent
boots to an idle prompt and takes no turn on its own, so spawn rings a best-effort doorbell over the
boot-race-aware `nudge` path. That decision stands and is not reopened here.

What ADR-0027 also encoded — and what this ADR overturns — is *how the brief reaches the peer*. It
split delivery into two acts and assigned them to two different mechanisms:

- **payload-delivery** — spawn writes the brief to a file in the hub;
- **context-delivery** — the peer's **own SessionStart hook** (`mail hook`) reads that file on its
  first call while its status is `spawning`, injects it as `## Your brief`, and flips the status to
  `active`;
- **turn-delivery** — the doorbell, whose text was therefore content-free:
  `"Your brief is loaded in context — read it and begin work."`

The wake asserted a state it did not establish. Pickup depended on a hook firing in the child, in the
child's harness, with the hub's hook correctly installed — none of which the spawning side can
observe or guarantee. When that chain breaks the peer is woken and told to read a brief that is not
there, which is worse than not being woken: the failure is silent and the peer improvises.

The hook branch also carried the *only* reader of the `spawning` status and the *only* transition
*out of* it, so a bookkeeping status existed purely to sequence a one-shot injection.

## Decision Drivers

- **The wake should be self-sufficient.** A turn-delivery mechanism that depends on a second,
  unobservable delivery mechanism having already run is not a mechanism, it is a race.
- **Do not re-type the brief.** Typing the brief body into the pane was never acceptable: it is
  unbounded in size, and the boot-race path re-submits, which would re-type it per retry.
- **Mechanism, not routing.** The `cyberlegion` CLI charter is dumb hands. This must not become
  routing judgment (that is the plugin's, and is the next CR).
- **Fewer moving parts.** A status that exists only to sequence an injection is not worth keeping if
  the injection goes away.

## Considered Options

### Option A: Keep the split, harden the hook

Keep hook-injection, and make spawn verify the child's hook actually fired before ringing.

- **Pros**: no contract change; the brief still arrives pre-loaded, costing the peer no read.
- **Cons**: the verification is the hard part and is not reliably observable from the spawning side —
  it needs the child's harness to have booted, run its hook, and written something the parent can
  see. It buys a weaker guarantee than simply not depending on the hook, and keeps `spawning` alive.

### Option B: The wake carries the instruction, naming the brief's path (chosen)

The first-turn doorbell becomes the instruction itself — *read your brief at `<path>`, then begin
work* — naming the file path rather than carrying the brief's body. The hook's injection branch is
retired; `mail hook` surfaces unread mail, owner mail and the Legion-setup nudge — never a brief.

- **Pros**: one mechanism delivers the turn *and* the instruction, so pickup cannot depend on a hook
  firing in the child. The brief is still written to its file and still never typed into the pane, so
  the instruction is one line however large the brief is, and a boot-race re-submit re-types only
  that line. Retiring the branch removes the last reader of `spawning`.
- **Cons**: the peer spends one tool call reading its brief instead of finding it pre-loaded. A
  caller using `--no-wake` must now convey the path itself. And the retirement is only observable at
  the CLI boundary through a legacy record (below).

### Option C: Wake carrying the brief body inline

Type the brief into the pane as the doorbell.

- **Pros**: no file read at all; fully self-contained.
- **Cons**: rejected outright — unbounded pane input, and the boot-race path re-submits, so a long
  brief would be re-typed per retry. This is exactly what `unit/lifecycle`'s frozen brief-by-file and
  never-re-typed scenarios forbid.

## Decision

Adopt **Option B**.

- `console/doorbell.ts` exposes `spawnDoorbell(briefPath)` — the instruction naming the path. The
  former `SPAWN_DOORBELL` constant is gone; `WakeSpawnInput` carries `briefPath`.
- `runtime/inject-inbox.ts` no longer reads or injects a brief, on any status, on the first hook call
  as on every later one — it surfaces unread mail, owner mail, and the Legion-setup nudge, nothing
  else.
- `session.ts` registers a spawned peer `status: 'active'` outright, and `spawning` leaves
  `AgentStatus`.

Everything ADR-0027 decided about *turn*-delivery is retained unchanged: the ring reuses `nudge`'s
submit-verify path with the wider cold-boot retry budget, `--no-wake` opts out, and a ring that never
completes is a stderr warning rather than a failed spawn.

## Rationale

The split ADR-0027 chose was a reasonable read of the machinery available at the time — the hook
already ran in the child, so putting the brief there cost nothing extra. What it missed is that the
two acts have different failure modes and the wake had no way to detect the other one's failure.
Collapsing them removes the coordination problem rather than trying to observe it.

Naming the path rather than inlining the body is what makes the collapse affordable: the wake stays a
single bounded line, which is what lets it survive the boot-race re-submit path untouched.

## Consequences

### Positive

- Brief pickup no longer depends on hook installation or hook execution in the child.
- The doorbell no longer asserts a state it did not establish.
- One fewer status and one fewer state transition in the registry.

### Negative

- The peer reads its brief with an explicit tool call rather than finding it in context.
- `--no-wake` changed meaning without changing its flag text: previously *no turn, brief auto-loaded*;
  now *no turn **and** brief unread on disk*. A caller driving the first turn itself must convey the
  path. Caller-side, and the subject of the follow-up CR.

### Risks

- **Dropping `spawning` loses the only signal for "spawned, ring failed, never took its turn".**
  `unit who` filters only `exited`, and the ring is best-effort, so a peer whose wake silently never
  landed now reports `active` and is indistinguishable by eye. Accepted knowingly; if a fleet view
  later wants to surface stuck units, that signal needs rebuilding as a turn fact rather than a
  registry status.
- **The named path is in the global hub, not the peer's own worktree.** Briefs live under
  `~/.agents/cyberlegion/`, while the spawned peer's cwd is its worktree. So the instruction points
  outside the tree the peer is working in, and pickup now depends on the peer being able to *read*
  that path — a failure mode of the same shape as the hook dependency this ADR removes, moved from
  "did a hook run?" to "is the hub readable from here?". Strictly better (the peer can see and report
  the failure instead of improvising silently), but not zero. If briefs ever need to be worktree-local,
  that is a change to where `spawn` writes them, not to what the wake says.
- **A migrated record may still carry `spawning`.** `admin migrate` carries agent records from older
  hubs, so the retired value remains reachable on disk. **Reads therefore preserve an unknown status
  verbatim** — no read path validates, coerces, or normalizes a status, and none may start doing so.
  This is frozen on `mail/surface` (a legacy `spawning` record gets no brief and keeps the status it
  was migrated with) and typed by the open member on `AgentRecord`. The exceptions are deliberate
  lifecycle writes, not normalizations: `register` asserts a session is live now and writes `active`;
  `prune`/`reconcile` write `exited`. A legacy record moves off `spawning` by an explicit lifecycle
  act, never by being read.

## Implementation Notes

The suite change is a **narrowing**, taken under a Clearance grant given live before drafting:
`mail/surface` loses both brief-injection scenarios and `unit/lifecycle` rewrites the first-turn
doorbell step plus the pre-registration status. `mail/doorbell` is untouched — no scenario there
references the spawn doorbell.

Worth recording for whoever revisits this: at the spec gate, the replacement `mail/surface` scenario
initially could **not** catch a partial implementer that landed the wake change and skipped the hook
cleanup — with `spawning` retired, the only constructible fixture is `active`, under which the
un-retired branch is inert. The legacy-`spawning` scenario is what makes the retirement observable at
all, and an ablation run confirms it is the only one of the two that fails when the branch is
restored. Do not "simplify" it away.

## Related Decisions

- [ADR-0027](0027-spawn-delivers-first-turn.md) — superseded: turn-delivery is retained, the
  payload/context split is not.
- [ADR-0025 *session-adapter verify-effect-or-fail-loud*](0025-session-adapter-verify-effect-or-fail-loud.md)
  — the `nudge` boot-race primitive both ADRs reuse. Named in full because the repo carries two
  ADR-0025s; the other is the mission-graph compiler/scheduler model.
- [ADR-0024](0024-cyberlegion-cli-node-alignment.md) — the dumb-hands CLI charter this stays inside.
