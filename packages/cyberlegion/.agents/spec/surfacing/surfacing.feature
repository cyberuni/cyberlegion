@frozen
Feature: surfacing — inject unread mail into a session across harnesses
  mail hook emits the harness hook injection payload for a spawned peer's pending brief and its
  unread mail; admin install wires that hook into a project's harness config. The mail primitives
  themselves live in mail; the doorbell nudge lives in session; thread correlation and the bounded
  mail await/watch live in wake.

  # ── mail hook emits brief + unread mail ──

  Scenario: a spawned peer's first hook call injects its pending brief
    Given a peer registered with status spawning and a brief file waiting
    When it runs mail hook --event SessionStart
    Then the payload includes the brief text under "Your brief"
    And the peer's status becomes active

  Scenario: a later hook call does not re-inject the brief
    Given a peer whose status is already active (its brief was injected on a prior call)
    When it runs mail hook --event SessionStart
    Then the payload contains no brief section

  Scenario: unread mail is included on every hook call
    Given a registered caller with two unread messages
    When it runs mail hook --event SessionStart
    Then the payload lists both messages under "Unread mail (2)" with sender, subject, body, and id

  Scenario: the payload uses the harness hookSpecificOutput shape as raw JSON
    Given a registered caller with unread mail
    When it runs mail hook --event SessionStart
    Then stdout is parseable JSON shaped as hookSpecificOutput with hookEventName and additionalContext
    And it is not TOON-formatted

  # ── The dedicated hook command is used, not a generic exec ──

  Scenario: only mail hook produces the injection payload
    Given a project with the surfacing hook installed
    When the harness fires SessionStart
    Then the configured command is exactly "cyberlegion mail hook --event SessionStart"

  # ── An unregistered caller injects nothing rather than erroring ──

  Scenario: a caller with no identity and in no multiplexer pane gets no output and no error
    Given a session with no resolvable self id and in no multiplexer pane
    When it runs mail hook --event SessionStart
    Then stdout is empty
    And the command exits 0

  Scenario: a SessionStart hook auto-registers a live-pane session that has no identity yet
    Given a session in a multiplexer pane with no identity registered yet, no unread mail, and no brief
    When it runs mail hook --event SessionStart
    Then the session is registered and its pane resolves to a new agent id
    And stdout is empty
    And the command exits 0

  Scenario: auto-register in the hook is best-effort and never fails the turn
    Given a session in a multiplexer pane with no identity and no detectable harness
    When it runs mail hook --event SessionStart
    Then stdout is empty
    And the command exits 0

  # ── No unread mail and no pending brief injects nothing ──

  Scenario: a registered, active caller with an empty inbox and no pending brief injects nothing
    Given a registered active caller with no unread mail and no brief pending
    When it runs mail hook --event SessionStart
    Then stdout is empty
    And the command exits 0

  # ── An unsupported --event is rejected ──

  Scenario: an unsupported --event value is rejected
    Given a caller running mail hook --event PreToolUse
    When the hook runs
    Then it throws naming SessionStart and PostToolUse as the supported events

  # ── install wires the hook per harness, idempotently, event-scoped by vendor support ──

  Scenario: install registers SessionStart for every harness
    Given a fresh project directory
    When admin install --agent claude, admin install --agent cursor, and admin install --agent codex each run
    Then each harness's own config registers "cyberlegion mail hook --event SessionStart" under its own event key

  Scenario: install registers PostToolUse only where the harness supports it
    Given the same fresh project directory
    When admin install runs for claude, cursor, and codex
    Then claude's and codex's configs register a PostToolUse hook
    And cursor's config has no PostToolUse entry

  Scenario: re-running install for the same harness does not duplicate the entry
    Given a harness already installed once
    When admin install runs again for that harness
    Then the result reports "already present" rather than registering a second entry
    And the config's hook list for that event still has exactly one entry

  # ── Owner mail surfaces into a root session, never into a spawned unit ──

  Scenario: a root session surfaces the owner's unread mail with bodies
    Given a standing owner homa with one unread message
    And a registered top-level session that was not spawned by another agent
    When the top-level session runs mail hook --event SessionStart
    Then the payload includes homa's unread message with its body under an owner-mail heading naming homa
    And that heading is distinct from the caller's own "Unread mail" section

  Scenario: a spawned unit does not surface the owner's mail
    Given a standing owner homa with one unread message
    And a registered session that was spawned by another agent (its record has a spawnedBy)
    When the spawned unit runs mail hook --event SessionStart
    Then the payload contains no owner-mail section

  Scenario: surfacing the owner's mail never acks it
    Given a standing owner homa with one unread message and a root session
    When the root session runs mail hook --event SessionStart twice
    Then the owner message is surfaced on both calls
    And it remains unread after both

  Scenario: an acked owner message no longer surfaces
    Given a standing owner homa whose only message has been acked
    When a root session runs mail hook --event SessionStart
    Then the payload contains no owner-mail section

  Scenario: a root session with no standing owner surfaces no owner mail and does not error
    Given no standing owner record exists
    And a registered top-level session with no unread mail of its own
    When it runs mail hook --event SessionStart
    Then stdout is empty
    And the command exits 0
