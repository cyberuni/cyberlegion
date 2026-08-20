# Pod C — testing/API-design lessons for cyberlegion, mined from agmsg + firstmate

Sources cloned shallow into `refs/agmsg` (fujibee/agmsg) and `refs/firstmate`
(kunchenguid/firstmate). Both are filesystem-only, daemonless, multi-agent
CLI coordination tools — the closest comparables to cyberlegion's Store/
mailbox/registry/wake model.

## 1. agmsg — test stack and structure

- **Stack**: Bash scripts + SQLite core, tested with **Bats** (`tests/*.bats`,
  ~85 files) for the shell/CLI layer, plus **Vitest** (`tests/*.test.mjs`,
  `server/test/*.test.ts`, `app/src/*.test.ts`) for a Tauri desktop app and a
  sync server. CI shards the Bats suite (`shard-tests.sh`) and runs a
  Windows/macOS/Linux matrix — several tests are explicitly OS-conditional
  (`skip_on_windows` / `skip_unless_windows` helpers), because pid liveness,
  cmdline matching, and sqlite text-mode CRLF all diverge by platform.
- **Structure**: one shared `tests/test_helper.bash` supplies fixtures and
  polling helpers reused by all ~85 files. Every test gets an isolated temp
  skill dir (`TEST_SKILL_DIR`) with its own DB/teams, `HOME` is sandboxed per
  test so nothing touches the real developer machine, and `test_storage_contract.bats`
  runs the **same assertions against two backing stores** (JSONL and SQLite)
  to prove the storage interface is truly swappable — this is the "port +
  two adapters, one contract suite" pattern.
- **Notable techniques**:
  - **Bounded polling, never fixed sleeps**: `wait_for_file`, `wait_for_pid_exit`,
    `wait_for_file_contains`, `wait_for_file_is` — all poll on a 100ms tick
    with a 10s ceiling and return non-zero on timeout, replacing `sleep 1`
    guesses. The helper file has a long comment explaining exactly why a fixed
    sleep is wrong in both directions (too slow locally, still flaky on a
    loaded CI runner).
  - **Correct "process is gone" check**: `_pid_gone` is NOT `! kill -0`. A
    failed `kill -0` can mean ESRCH (dead) *or* EPERM (alive, unsignalable —
    real under sandboxes). It parses the kill error text, then cross-checks
    `ps -o stat=` for zombie state, because "gone" must not be inferred from
    a single ambiguous signal.
  - **Decoy processes with matching cmdline, not bare `sleep`**: kill logic
    only signals a pid whose *cmdline* still looks like the real watcher (pid
    recycling defense). Their own comment records that fixtures using a bare
    `sleep` let a kill-path bug go untested for years because the assertion
    silently passed.
  - **`refute()` helper**, because `! cmd` under `errexit` silently passes when
    the command it's negating actually succeeds — measured wrong on two real
    bash versions, and documented as a defect discovered twice (#670).
  - **Lock contract tested exhaustively**, not just happy path:
    `test_registry_lock.bats` covers contention+timeout, unwritable dir,
    stale-holder identification, releasing an already-gone lock ("stays
    quiet"), releasing while a **successor** now holds it (never steal a
    newer lock), same-pid-two-locks release, path-with-space safety, and
    "no entropy source ⇒ no token recorded, nothing removed" (a fail-closed
    fallback for missing `/dev/urandom` etc.).
  - **Storage contract suite proves system invariants directly**: collision-free
    ids, `mark_read_batch` idempotent, per-recipient read isolation, a
    **monotonic delivery cursor that never regresses**, cursor migration
    correctness, "a data op fails non-zero on a broken store — no silent
    success", corrupt-log handling, and legacy-row compatibility across a
    storage migration.
  - **Migration between stores tested for crash-safety and dedupe**: content
    match ("same id, different content ⇒ refused"; "same id, same content ⇒
    not refused"), cursor drift refusal, re-entrant/idempotent re-run,
    partial-copy detection ("destination missing some shared rows ⇒
    refused"), and a destination that "vanished" mid-flight.
  - **Injection-safety tests as first-class**: SQL injection via crafted
    agent/team names or non-numeric `--limit` (`#87`), path traversal via
    `../` team names, and PATH-shape lockdown fixtures (`path_without_python3`,
    `path_without_age`) built by whitelisting exact tools rather than filtering
    the real PATH (so a stray system binary can't accidentally still satisfy
    the "not found" test).
  - **Windows-specific regression fixtures**: CRLF-stripped sqlite output
    comparisons, `cygpath` path conversion for `sqlite3 readfile()`, and stale
    pidfile sweeps that must "keep a live watcher pidfile tasklist cannot
    see" — evidence tasklist-based liveness checks were previously wrong.

## 2. firstmate — test stack and structure

- **Stack**: a hand-rolled Bash test framework (`test_...()` functions, a
  shared `wake-helpers.sh`/`fail`/`pass`), ~160 `*.test.sh` files, one Python
  test (`fm-backend-herdr-eventwait.test.py`) for the one component that
  needed real async I/O assertions. `bin/fm-test-run.sh` is a dedicated test
  **runner** with named lanes (`--all`, `--family`, `--changed`, `--lane
  portable-parallel-N`, `--lane portable-serial`, `--proven-isolated`),
  machine-parseable `FM_TEST_BEGIN/END/SUMMARY` markers, and a
  `--check-coverage` guard that fails if a family isn't in any lane.
- **Structure/notable techniques**:
  - **A dedicated, *proven* parallel-safe subset**: `bin/fm-test-isolation-proof.sh`
    actually runs the candidate "proven isolated" test files N-way concurrent
    and records a machine-readable proof artifact (`docs/fm-test-isolation-proof.json`)
    with per-script durations and worker assignment — parallel CI lanes are a
    partition of *exactly* that proven set, not an assumption. Anything
    stateful is excluded by family, never by ad hoc guesswork.
  - **Real-process concurrency tests, not mocked ones**: `fm-watcher-lock.test.sh`
    launches two actual competing processes (`test_singleton_start`,
    `test_lock_single_winner_under_concurrency`,
    `test_lock_stale_steal_single_winner_under_concurrency`) and polls with
    `is_live_non_zombie` until exactly one survives — the comment explicitly
    says these stay as "focused real-process units" because a race bug "may
    not reproduce through an e2e."
  - **Lock steal semantics tested directly**: steals a lock held by a dead
    pid, refuses to steal a live one, handles "empty pid uses minimum grace",
    a **late claim that loses after the lock file was recreated underneath
    it** (`test_lock_late_claim_loses_after_recreate`), and a claim paused
    mid-acquire that must fail once the object it was claiming moved
    (`test_lock_paused_mid_acquire_claim_fails_during_steal`) — this is a
    literal TOCTOU (time-of-check/time-of-use) regression test.
  - **PID-identity correctness under adversarial conditions**: locale
    invariance (`LC_ALL` pinned because `date` output differs by locale) and
    **PID reuse detection independent of wall clock**
    (`test_proc_pid_identity_ignores_wall_clock_and_detects_pid_reuse`) — the
    same defect class as agmsg's "kill -0 must not equal alive."
  - **Wake/append queue tested for exactly the invariants a mailbox needs**:
    `test_concurrent_append_and_drain`, `test_atomic_double_drain` (drain
    exactly once even if invoked twice), `test_drain_dedupes_obvious_duplicates`,
    `test_self_held_lock_reclaims_instead_of_deadlocking` (self-deadlock
    guard — a process must be able to recover from its own stale lock),
    `test_interruption_before_and_after_raw_commit` (explicit crash-injection
    around the atomic-write boundary), `test_wake_publish_requires_atomic_recovery_evidence`,
    `test_stale_recovery_generation_cannot_touch_a_newer_episode` (an
    ABA/generation-fencing test — an old recovery attempt must not clobber
    newer state), and `test_slow_annotation_does_not_block_append_and_deleted_file_fails_open`.
  - **Delivery/ack semantics tested for exactly-once and idempotency**:
    `fm-pending-reply.test.sh` covers `test_normal_correlated_reply_resolves_once`,
    `test_recovery_attempt_is_never_reinjected`,
    `test_concurrent_resolution_closes_escalation_once`,
    `test_concurrent_escalation_yields_to_late_reply` (a race between two
    legitimate resolutions, deciding a winner deterministically),
    `test_transport_success_is_not_reply_success` (delivery-confirmed ≠
    logically-acked — a distinction cyberlegion's `readAck` docstring
    gestures at but doesn't test explicitly for the transport layer),
    and `test_failed_send_discards_undelivered_expectation` (no dangling
    expectation if the send itself failed).
  - **Session/lock ancestry tests simulate crash + orphan scenarios end to
    end**: `test_e2e_daemon_parented_session_claims_the_home`,
    `test_harness_beyond_a_gap_never_owns_the_lock` (a process ancestry
    chain with a gap must not be trusted), `test_orphaned_stale_packed_refs_lock_recovers`
    vs `test_live_packed_refs_lock_is_never_removed` (never touch another
    live writer's lock, even a foreign one — git's own `packed-refs.lock`).

## 3. Invariants THEY test that cyberlegion does not appear to test

| Invariant | agmsg | firstmate | cyberlegion today |
|---|---|---|---|
| Concurrent writers to the same store/queue, real processes racing | ✓ (`test_registry_lock`) | ✓ (`fm-watcher-lock`, `fm-wake-queue`) | Not exercised — no test spawns two real Node processes against one `FileStore` root |
| Crash mid-write / partial-write recovery | ✓ (`test_storage_contract` corrupt-log tests, `test_migrate_team_store`'s "destination vanished" cases) | ✓ (`test_interruption_before_and_after_raw_commit`) | Not exercised, and the implementation itself has the gap (see §4) |
| Stale-lock reclaim vs. live-lock-never-stolen | ✓ (`test_registry_lock`) | ✓ (`test_lock_steals_dead_pid_lock`, `test_lock_does_not_steal_live_lock`) | N/A — cyberlegion currently has no locking primitive at all (see §4) |
| TOCTOU / late-claim-loses-after-object-moved | — | ✓ (`test_lock_paused_mid_acquire_claim_fails_during_steal`) | Not exercised |
| PID liveness correctness (ESRCH vs EPERM vs unrecognized, zombie handling) | ✓ (`test_wait_helpers`, `_pid_gone`) | ✓ (`test_pid_identity_is_locale_invariant`, proc-based identity) | cyberlegion's `identity.ts` prune/reconcile tests check pane liveness via the mux, but there is no direct unit test of a raw pid-liveness primitive against ESRCH/EPERM/zombie |
| Exactly-once ack / delivery under a race between two resolution paths | ✓ (`mark_read_batch` idempotent, per-recipient isolation) | ✓ (`test_concurrent_resolution_closes_escalation_once`, `test_concurrent_escalation_yields_to_late_reply`) | Single-process idempotency is tested (`readAck` "already-acked returns acked:false"), but no test has two *concurrent* callers racing to ack/consume the same message |
| Monotonic cursor / no-regression guarantee across compaction or migration | ✓ (`the delivery tip never regresses across a compact`) | — | No equivalent concept exists yet (cyberlegion has no cursor/tip abstraction — worth deciding if `watch`/`await` need one as polling scales) |
| Fail non-zero on a broken/corrupt store (no silent success) | ✓ (`a data op fails non-zero on a broken store`) | ✓ (fail-open explicitly tested and named, e.g. `deleted_file_fails_open`) | `readMessages`/`listAgents` in `file-store.ts` call `JSON.parse` on every file with no try/catch — a corrupt or torn-write file currently throws an unstructured `SyntaxError` up through every consumer, untested |
| Injection / path-traversal safety on user-controlled identifiers | ✓ (`#87` SQL injection, `../` traversal, quote-in-name) | — (less relevant, no SQL) | Not exercised — cyberlegion accepts arbitrary `toId`/`agentId`/pane strings that become filenames; no test for `../`, embedded slashes, or reserved characters |
| Real multi-process CLI e2e races (two CLI invocations at once) | ✓ (bats spawns real subprocesses throughout) | ✓ (real bash processes) | cyberlegion's `cli.e2e.test.ts` spawns the real CLI (good), but always sequentially — no concurrent-invocation e2e test |
| A proven-safe parallel test subset, verified by actually running it concurrently | — | ✓ (`fm-test-isolation-proof.sh`) | cyberlegion's `vitest run src` runs whatever vitest's default parallelism is, with no verification pass proving which files are safe to run concurrently |
| Locale/timezone/platform-independence of identity or timestamp comparisons | ✓ (Windows CRLF, cygpath) | ✓ (`LC_ALL` pin, proc-based over `ps`-text-based) | Not exercised — cyberlegion is Linux/macOS-oriented via tmux/herdr but no test pins locale for any string comparison |

## 4. Ranked, actionable hardening items for cyberlegion

1. **Atomic writes for every store mutation (write-temp-then-rename), not `writeFileSync` direct.**
   *Invariant at risk*: readers must never observe a partially-written file.
   *Failure mode*: `putMessage`, `putAgent`, `putPaneIndex`, `writeBrief`,
   `setMainPane` in `src/store/file-store.ts` all call `writeFileSync` on the
   final path directly. A process killed (or crashing) mid-write, or a reader
   racing a writer on a large record, can hand `JSON.parse` a truncated file,
   which throws an uncaught `SyntaxError` from deep inside `listInbox`/
   `listAgents`/`getAgent`.
   *Test to write*: write a message body large enough to require multiple
   write() syscalls (or truncate a `.json` file mid-content in the test
   fixture, simulating a crash), then assert `listInbox`/`listAgents` either
   skips the corrupt record with a typed error or throws a store-level
   `CorruptRecordError` — never a bare `SyntaxError` bubbling from `JSON.parse`.
   Only `ackMessage`'s move is atomic (`renameSync`) today; extend the same
   pattern (write to `*.json.tmp`, `renameSync` into place) to every writer.

2. **Add and test a real advisory lock primitive (mkdir-based or O_EXCL), for the one place that is a true read-modify-write: `setMainPane`/pane-index rebind and any future counter/cursor.**
   *Invariant at risk*: "exactly one bound main pane" (already asserted
   single-process in `file-store.test.ts`) has no concurrency guarantee.
   *Failure mode*: two processes calling `setMainPane` (or any future
   claim/rebind op) at once can interleave writes; today's design tolerates
   last-write-wins for single-value overwrites, but nothing proves that, and
   nothing prevents a torn write per item 1.
   *Test to write*: spawn two real Node/CLI processes both calling
   `unit claim`/`setMainPane` concurrently in a tight loop for N iterations;
   assert the file always contains one fully-valid value (never garbage,
   never two lines) at every observed instant. Model the assertion style on
   agmsg's `test_registry_lock.bats` (contention, stale-holder identification,
   "a process holding two locks releases both", "no entropy source ⇒ no
   token recorded, nothing removed").

3. **Correct pid-liveness primitive, unit-tested against ESRCH/EPERM/zombie, not just "kill -0 works or doesn't".**
   *Invariant at risk*: `prune`/`reconcile` in `identity.ts` treat a pane as
   dead based on mux-reported liveness, but if cyberlegion ever adds a direct
   pid check (e.g., for a future watcher/daemon), it must not conflate
   "unsignalable" (EPERM, common under sandboxes) with "dead" — agmsg found
   and fixed exactly this bug, and firstmate's `_pid_gone`-equivalent cross-
   checks `ps` state as well.
   *Test to write*: three fixtures — a real live pid, a pid the test process
   owns but that has exited (reaped and zombie forms), and a permission-denied
   case (skip on platforms where EPERM can't be simulated) — assert the
   liveness function distinguishes all three rather than treating any failed
   signal as "dead."

4. **Concurrent multi-process e2e for the CLI, not just sequential.**
   *Invariant at risk*: `putMessage`'s collision-free id already implies
   safety, but it has never been proven under real concurrent CLI
   invocations, only asserted "in the same millisecond" within one process
   (`message.test.ts`, "two sends in the same millisecond do not clobber
   each other").
   *Test to write*: extend `cli.e2e.test.ts` with a test that runs N `unit
   send` (or equivalent) child processes concurrently via `Promise.all`
   against one hub root, then asserts every message survived with no lost
   writes and no filename collision — mirrors agmsg's Bats suite spawning
   real subprocesses and firstmate's `test_concurrent_append_and_drain`.

5. **Fail non-zero / throw typed errors on a corrupt or missing store — audited as a store-level contract, not incidentally.**
   *Invariant at risk*: "no silent success on a broken store" (agmsg's own
   phrase for this bar).
   *Failure mode*: today an empty or half-written `agents/<id>.json` throws
   a generic `SyntaxError`; a missing root directory before `ensureMarker()`
   has run silently returns `[]` from `listAgents`/`listInbox` rather than
   signaling "store not initialized" — masking a real setup bug as "no
   agents yet."
   *Test to write*: a small `store-contract.test.ts` in the same spirit as
   agmsg's `test_storage_contract.bats` — a fixed list of behavioral
   assertions (collision-free ids, idempotent ack, corrupt file → typed
   error, missing marker → typed error, not silent success) that any future
   second `Store` implementation must also pass. This also protects against
   regressions if `FileStore` internals change.

6. **Path/identifier injection safety for `toId`/`agentId`/pane strings used as filenames.**
   *Invariant at risk*: a crafted handle/id containing `../`, a leading `-`,
   or path separators must not escape the hub root or collide with another
   agent's files.
   *Failure mode*: `paths.inboxDir(root, toId)` and friends presumably
   `join(root, ..., toId)` — if `toId` is attacker/user-controlled (it is:
   it comes from `--to <handle>` or resolved ids) and unsanitized, `../../x`
   could write outside the hub.
   *Test to write*: send/register with an id or handle containing `../`,
   `/etc/passwd`-style absolute paths, embedded null bytes, and leading `-`
   (bats-style CLI flag confusion); assert the store rejects rather than
   writing outside `root`. Directly modeled on agmsg's `#87` SQL-injection
   and path-traversal team-name tests (different mechanism, same underlying
   defect class: unsanitized user string becomes a filesystem/DB primitive).

7. **Monotonic cursor guarantee for `watch`/`await`, tested explicitly, before it becomes load-bearing.**
   *Invariant at risk*: as `watch`/`await` (poll-based) usage scales, any
   future cursor/tip optimization must never regress or re-deliver.
   *Failure mode*: none yet (cyberlegion currently just filters by acked
   state each poll), but agmsg's storage-contract suite treats "the delivery
   tip never regresses across a compact" as a first-class assertion —
   worth writing now as a design contract test even before an optimization
   is built, so the invariant is pinned before it's needed.
   *Test to write*: property-style test — for any sequence of sends/acks/
   watch-polls, the set of messages a poller has seen is monotonically
   non-decreasing and never repeats an already-acked-and-consumed id.

8. **A proven-parallel-safe test subset + real concurrent CI verification, instead of trusting vitest's default scheduler.**
   *Invariant at risk*: test suite integrity — a "safe to run in parallel"
   claim should be proven, not assumed.
   *Failure mode*: as the suite grows (especially once item 4's multi-process
   e2e tests land, which use real ports/pids/tmux panes), some tests will be
   genuinely stateful (e.g., anything touching a shared tmux/herdr session or
   `$HOME`) and must not run concurrently with each other.
   *Test to write*: not a unit test but a CI-facing script modeled on
   firstmate's `fm-test-isolation-proof.sh` — actually run the candidate
   parallel-safe file set N-way concurrent and record a proof artifact;
   partition CI shards from that proven set only.

## 5. API-design lessons worth adopting

1. **Distinguish "delivered" from "acknowledged"/"processed", and name both.**
   firstmate's `test_transport_success_is_not_reply_success` is exactly the
   lesson: a message reaching the mailbox is not the same claim as the
   recipient having consumed it. cyberlegion's `readAck` already separates
   read-and-consume from `peek` (read-without-ack) — that's the right shape —
   but as soon as any transport step is added on top of `Store` (e.g. a
   future socket/relay layer), keep "written to store" and "acted on by
   recipient" as two distinctly-named, distinctly-testable states, the way
   firstmate's pending-reply layer does. Don't let a future retry/relay
   feature conflate the two, which is the exact defect firstmate had to
   correct for.

2. **Idempotent-by-construction operations should say so in both the API and the test name, and fail loud (typed error) rather than silently no-op in the wrong case.** agmsg's `mark_read_batch is idempotent (double mark is a no-op)` and firstmate's `test_atomic_double_drain` / `test_self_held_lock_reclaims_instead_of_deadlocking` model this well: idempotency is asserted as a named invariant, and the reclaim-vs-deadlock distinction is explicit (a caller must be able to recover from *its own* stale lock without that turning into "any caller can steal any lock"). cyberlegion's `readAck` already does the right thing (`acked: false`, no throw, on double-ack) — extend that same discipline to any future lock/claim primitive: recovering your own stale state is safe; stealing someone else's live state is always an error, and both need their own test.

3. **Fail-closed on ambiguous signals; never treat "I couldn't tell" as "it's fine."** The single most repeated lesson across both codebases is that a *failed* liveness/lock/lookup check has more than one meaning (ESRCH vs EPERM; missing file vs file-not-yet-flushed; corrupt JSON vs empty inbox), and every one of these tools was bitten by collapsing that ambiguity into a boolean at least once (agmsg's `#670`, `#245`, `#567`-style regressions; firstmate's `fail_open` tests that name the fallback explicitly). When cyberlegion adds any new liveness/lock/corruption-detection code, the API should expose a three-state or explicit-error result rather than a boolean, and every "unknown" branch needs its own named test — not a `¬alive ⇒ dead` shortcut.
