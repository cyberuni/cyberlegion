@frozen
Feature: unit lifecycle — warm peer session lifecycle over a multiplexer
  Spawn a new peer session — in a new git worktree it creates, or in an existing directory a caller
  supplies (--cwd) — and its session pane, then tear it back down cleanly — spawn and close are a
  deterministic inverse pair. Registry/discovery lives in unit/registry; backend selection and
  placement live in mux; sending/reading mail lives in mail; hook-based mail/brief injection lives
  in mail/surface.

  # ── spawn registers as spawning before it starts ──

  Scenario: spawn pre-registers the peer before the session actually launches
    Given a caller spawning a new peer with --harness claude --task "reply to alice"
    When unit spawn runs
    Then the peer is registered with status spawning and spawnedBy the caller's id
    And its brief file and pane pointer are written

  # ── The new worktree is always distinct from the primary checkout ──

  Scenario: spawn refuses a --worktree-path that resolves onto the primary checkout
    Given a caller running unit spawn with --worktree-path set to the primary checkout's own root
    When unit spawn runs
    Then it throws refusing to run a unit in the primary checkout
    And no session is opened

  # ── The brief is delivered by file, never typed ──

  Scenario: the resolved brief is written to the peer's brief file, not into the launch command
    Given a caller running unit spawn --task "do the thing"
    When unit spawn runs
    Then the peer's brief file contains "do the thing"
    And the typed launch command carries no brief text

  # ── An unmapped harness errors before anything launches ──

  Scenario: an unmapped --harness errors without opening a worktree or session
    Given a caller running unit spawn --harness grok --task t
    When unit spawn runs
    Then it throws naming the launch map
    And no worktree is created

  # ── No brief source errors ──

  Scenario: spawn with no --task, --task -, or --brief-file errors
    Given a caller running unit spawn --harness claude with no brief source at all
    When unit spawn runs
    Then it throws asking for a brief

  # ── --agent/--agent-file realizes a resolved def's launch ──

  Scenario: --agent resolves a def whose harness/model/instructions compose the launch
    Given an agent def named reviewer with harness claude and model sonnet
    When a caller runs unit spawn --agent reviewer --task t
    Then the spawned peer's harness is claude
    And the launch command carries that def's model and instructions

  Scenario: an explicit --harness overrides the resolved def's own harness
    Given an agent def with harness claude
    When a caller runs unit spawn --agent <name> --harness codex --task t
    Then the spawned peer's harness is codex

  # ── Spawn into an existing dir without a worktree (--cwd) ──

  Scenario: --cwd spawns a session into an existing directory and creates no worktree
    Given a caller running unit spawn --cwd <an existing directory outside the primary checkout> --harness claude --task t
    When unit spawn runs
    Then no worktree is created
    And the session opens in that directory
    And the peer is registered with that directory as its cwd and no created worktree

  Scenario: --cwd requires the directory to already exist
    Given a caller running unit spawn --cwd pointed at a path that does not exist
    When unit spawn runs
    Then it throws that the --cwd directory must already exist
    And no session is opened

  Scenario: --cwd refuses the primary checkout, the same as a created worktree
    Given a caller running unit spawn --cwd set to the primary checkout's own root
    When unit spawn runs
    Then it throws refusing to run a unit in the primary checkout
    And no session is opened

  Scenario: --cwd is mutually exclusive with the worktree-creating flags
    Given a caller running unit spawn --cwd <dir> together with --worktree-path or --branch
    When unit spawn runs
    Then it throws that --cwd cannot combine with worktree-creating flags
    And no session is opened

  # ── close tears down the worktree + session and reaps the state (spawn's inverse) ──

  Scenario: close removes the worktree, tears down the session, and reaps the registry record
    Given a registered unit with a worktree and a live session pane
    When a caller runs unit close <id>
    Then the worktree is removed
    And the session pane is torn down
    And the unit's registry record, pane pointer, and stored data are gone

  # ── close on a --cwd unit tears down the session but touches no worktree ──

  Scenario: close on a unit spawned with --cwd removes no worktree
    Given a registered unit spawned with --cwd (a recorded cwd and no created worktree)
    When a caller runs unit close <id>
    Then no worktree removal is attempted
    And the session pane is torn down
    And the unit's registry record, pane pointer, and stored data are gone

  # ── Refuses the primary checkout even with --force ──

  Scenario: close refuses a unit whose worktree is the primary checkout
    Given a registered unit whose worktree root equals the primary checkout
    When a caller runs unit close <id>
    Then it throws refusing the primary checkout
    And the unit's record still exists

  Scenario: --force does not override the primary-checkout refusal
    Given a registered unit whose worktree root equals the primary checkout
    When a caller runs unit close <id> --force
    Then it still throws refusing the primary checkout

  # ── Refuses a dirty worktree unless --force ──

  Scenario: close refuses a unit with uncommitted changes in its worktree
    Given a registered unit whose worktree has uncommitted changes
    When a caller runs unit close <id>
    Then it throws about uncommitted changes
    And the unit's record still exists

  Scenario: --force discards uncommitted changes and completes the close
    Given a registered unit whose worktree has uncommitted changes
    When a caller runs unit close <id> --force
    Then the worktree is removed
    And the unit's record is gone

  # ── Completes the reap when the worktree/pane is already gone ──

  Scenario: close completes the reap when the worktree no longer exists on disk
    Given a registered unit whose worktree root no longer exists on disk
    When a caller runs unit close <id>
    Then no worktree removal is attempted
    And the unit's record and stored data are gone

  Scenario: close completes the reap when the session pane no longer exists
    Given a registered unit whose session pane the backend can no longer find
    When a caller runs unit close <id>
    Then the unit's record and stored data are gone regardless

  # ── A genuine teardown failure aborts before any reap ──

  Scenario: a genuine worktree-removal failure aborts the close and leaves the record intact
    Given a registered unit whose worktree removal genuinely fails
    When a caller runs unit close <id>
    Then it throws that removal failed
    And the unit's record and stored data are left intact for a retry

  # ── An unknown id errors ──

  Scenario: closing an unregistered id errors and reaps nothing
    Given no unit registered under a given id
    When a caller runs unit close <id>
    Then it throws that no unit is registered under that id

  # ── Reaps only the targeted unit ──

  Scenario: close leaves another unit's state untouched
    Given two registered units, a and b, each with their own worktree/pane/data
    When a caller runs unit close a
    Then unit a's state is gone
    And unit b's registry record, pane pointer, and stored data are unchanged

  # ── focus, nudge, read ──

  Scenario: focus moves input focus to a peer's session
    Given a registered peer with a live session pane
    When a caller runs unit focus <ref>
    Then the session adapter focuses that peer's pane

  Scenario: nudge delivers a default check-mail doorbell message to a peer's session
    Given a registered peer with a live session pane
    When a caller runs unit nudge <ref>
    Then the session adapter delivers the default check-mail message as a turn to that peer's pane

  Scenario: nudge carries a caller-supplied message with --message
    Given a registered peer with a live session pane
    When a caller runs unit nudge <ref> --message "<text>"
    Then the session adapter delivers that message as a turn to the peer's pane

  Scenario: read scrapes a peer's session screen
    Given a registered peer with a live session pane holding some output
    When a caller runs unit read <ref> --lines 20
    Then the captured trailing output from that pane is printed
