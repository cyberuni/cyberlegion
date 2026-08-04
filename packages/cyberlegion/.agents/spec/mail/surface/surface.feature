@frozen
Feature: mail surface — inject unread mail into a session across harnesses
  mail hook emits the harness hook injection payload for a session's unread mail and the standing
  owner's unread mail when this session is the hub's main pane. It carries no brief: a spawned
  peer's brief reaches it in the wake instruction, not through this hook (unit/lifecycle). The mail
  primitives themselves live in mail/core; thread correlation and the bounded mail await/watch live
  in mail/wait; the doorbell nudge lives in unit/lifecycle; installing the hook into a project's
  harness config lives in init.

  # ── mail hook emits unread mail, never a brief ──

  Scenario: unread mail is included on every hook call
    Given a registered caller with two unread messages
    When it runs mail hook --event SessionStart
    Then the payload lists both messages under "Unread mail (2)" with sender, subject, body, and id

  Scenario: the payload uses the harness hookSpecificOutput shape as raw JSON
    Given a registered caller with unread mail
    When it runs mail hook --event SessionStart
    Then stdout is parseable JSON shaped as hookSpecificOutput with hookEventName and additionalContext
    And it is not TOON-formatted

  Scenario: a spawned peer's hook call injects no brief
    Given a spawned peer whose brief file is on disk
    And it has one unread message
    When it runs mail hook --event SessionStart
    Then the payload lists that unread message
    And the payload contains no brief section
    And the peer's brief file still exists with its contents unchanged

  Scenario: a peer record carrying a legacy spawning status still gets no brief
    Given a peer record written by an older hub, carrying status spawning
    And its brief file is on disk
    And it has one unread message
    When it runs mail hook --event SessionStart
    Then the payload lists that unread message
    And the payload contains no brief section
    And the peer's record still carries the status it was migrated with

  # ── The dedicated hook command is used, not a generic exec ──

  Scenario: only the dedicated mail hook command produces the injection payload
    Given a project with the surfacing hook installed
    When the harness fires SessionStart
    Then the configured command runs the dedicated "mail hook --event SessionStart", not a generic exec

  # ── An unregistered caller injects nothing rather than erroring ──

  Scenario: a caller with no identity and in no multiplexer pane gets no output and no error
    Given a session with no resolvable self id and in no multiplexer pane
    When it runs mail hook --event SessionStart
    Then stdout is empty
    And the command exits 0

  Scenario: a SessionStart hook auto-registers a live-pane session that has no identity yet
    Given a session in a multiplexer pane with no identity registered yet and no unread mail
    When it runs mail hook --event SessionStart
    Then the session is registered and its pane resolves to a new agent id
    And stdout is empty
    And the command exits 0

  Scenario: auto-register in the hook is best-effort and never fails the turn
    Given a session in a multiplexer pane with no identity and no detectable harness
    When it runs mail hook --event SessionStart
    Then stdout is empty
    And the command exits 0

  # ── No unread mail injects nothing ──

  Scenario: a registered, active caller with an empty inbox injects nothing
    Given a registered active caller with no unread mail
    When it runs mail hook --event SessionStart
    Then stdout is empty
    And the command exits 0

  # ── An unsupported --event is rejected ──

  Scenario: an unsupported --event value is rejected
    Given a caller running mail hook --event PreToolUse
    When the hook runs
    Then it throws naming SessionStart and PostToolUse as the supported events

  # ── Owner mail surfaces into the bound main pane; falls back to any root session when unbound ──

  Scenario: the bound main pane surfaces the owner's unread mail with bodies
    Given a standing owner homa with one unread message
    And a registered top-level session bound as the hub's main pane
    When the main pane runs mail hook --event SessionStart
    Then the payload includes homa's unread message with its body under an owner-mail heading naming homa
    And that heading is distinct from the caller's own "Unread mail" section

  Scenario: a root session that is not the bound main pane does not surface owner mail
    Given a standing owner homa with one unread message
    And the hub's main pane bound to one pane
    And a second registered top-level session in a different pane
    When the second session runs mail hook --event SessionStart
    Then the payload contains no owner-mail section

  Scenario: with no main pane bound, any root session still surfaces owner mail
    Given a standing owner homa with one unread message
    And no main pane bound
    And a registered top-level session that was not spawned by another agent
    When the top-level session runs mail hook --event SessionStart
    Then the payload includes homa's unread message under an owner-mail heading naming homa

  Scenario: a spawned unit does not surface the owner's mail
    Given a standing owner homa with one unread message
    And a registered session that was spawned by another agent (its record has a spawnedBy)
    When the spawned unit runs mail hook --event SessionStart
    Then the payload contains no owner-mail section

  Scenario: surfacing the owner's mail never acks it
    Given a standing owner homa with one unread message and a bound main pane
    When the main pane runs mail hook --event SessionStart twice
    Then the owner message is surfaced on both calls
    And it remains unread after both

  Scenario: an acked owner message no longer surfaces
    Given a standing owner homa whose only message has been acked
    And a root session with no main pane bound
    When the root session runs mail hook --event SessionStart
    Then the payload contains no owner-mail section

  Scenario: no standing owner means no owner-mail section
    Given no standing owner record exists
    And a registered top-level session
    When it runs mail hook --event SessionStart
    Then the payload contains no owner-mail section
    And the command exits 0

  Scenario: an unbound root pane surfaces owner mail and the setup nudge together
    Given a standing owner homa with one unread message
    And no main pane bound
    And a registered top-level session in a pane that was not spawned by another agent
    When it runs mail hook --event SessionStart
    Then the payload includes homa's unread message under an owner-mail heading naming homa
    And the payload includes a "Legion setup" nudge pointing at cyberlegion init

  # ── The session-start setup nudge for an unbound root session ──

  Scenario: an unbound root pane gets a Legion setup nudge
    Given a registered top-level session in a pane with no main pane bound
    When it runs mail hook --event SessionStart
    Then the payload includes a "Legion setup" nudge pointing at cyberlegion init

  Scenario: binding a main pane silences the nudge
    Given a registered top-level session in a pane bound as the hub's main pane
    When it runs mail hook --event SessionStart
    Then the payload includes no "Legion setup" nudge

  Scenario: a spawned unit never gets the setup nudge
    Given a session spawned by another agent (its record has a spawnedBy), in a pane, with no main pane bound
    When it runs mail hook --event SessionStart
    Then the payload includes no "Legion setup" nudge

  Scenario: a non-multiplexer root session with no standing owner gets the setup nudge
    Given a registered top-level session in no multiplexer pane and no standing owner record
    When it runs mail hook --event SessionStart
    Then the payload includes a "Legion setup" nudge pointing at cyberlegion init

  Scenario: a non-multiplexer root session that already has a standing owner gets no nudge
    Given a registered top-level session in no multiplexer pane and a standing owner record present
    When it runs mail hook --event SessionStart
    Then the payload includes no "Legion setup" nudge

  Scenario: computing the gate or nudge never fails the turn
    Given a root session whose main-pane lookup raises an error
    When it runs mail hook --event SessionStart
    Then the command exits 0
    And it does not throw