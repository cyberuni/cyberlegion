@frozen
Feature: mail surface — inject unread mail into a session across harnesses
  mail hook emits the harness hook injection payload for a session's unread mail and the standing
  owner's unread mail when this session is the hub's main pane. It carries no brief: a spawned
  peer's brief reaches it in the wake instruction, not through this hook (unit/lifecycle). The mail
  primitives themselves live in mail/core; thread correlation and the bounded mail await/watch live
  in mail/wait; the doorbell nudge lives in unit/lifecycle; installing the hook into a project's
  harness config lives in init.

  # ── The --event value is validated and echoed ──

  Scenario: an unsupported --event value is rejected
    Given a caller running mail hook --event PreToolUse
    And a registered caller with one unread message
    When the hook runs
    Then it throws naming SessionStart as the supported event
    And no payload is emitted

  Scenario: a SessionStart hook call echoes SessionStart as the hook event name
    Given a registered caller with one unread message
    When it runs mail hook --event SessionStart
    Then stdout is parseable JSON whose hookEventName reads SessionStart
    And the payload lists that unread message

  Scenario: the retired PostToolUse event is rejected
    Given a registered caller with one unread message
    When it runs mail hook --event PostToolUse
    Then it throws naming PostToolUse as an unsupported event
    And no payload is emitted

  # ── An unregistered caller registers from a live pane, or injects nothing ──

  Scenario: a caller with no identity and in no multiplexer pane gets no output and no error
    Given a session with no resolvable self id
    And its environment carries the claude harness signal
    And that session is in no multiplexer pane
    When it runs mail hook --event SessionStart
    Then the registry holds the same agent records it held before the call
    And stdout is empty
    And the command exits 0

  Scenario: a live-pane session with no identity auto-registers and injects nothing
    Given a session in a tmux pane with no identity registered yet
    And its environment carries the claude harness signal
    And that pane is bound as the hub's main pane
    When it runs mail hook --event SessionStart
    Then that pane resolves to a new agent id in the registry
    And stdout is empty
    And the command exits 0

  Scenario: auto-register in the hook is best-effort and never fails the turn
    Given a session in a multiplexer pane with no identity
    And its environment carries no harness signal
    When it runs mail hook --event SessionStart
    Then that pane resolves to no agent id in the registry
    And stdout is empty
    And the command exits 0

  Scenario: a live pane the hub cannot address registers no reachable identity and injects nothing
    Given a session in a wezterm pane with no identity registered yet
    And its environment carries the claude harness signal
    When it runs mail hook --event SessionStart
    Then that pane resolves to no agent id in the registry
    And stdout is empty
    And the command exits 0

  # ── mail hook emits the caller's own unread mail ──

  Scenario: unread mail is included on every hook call
    Given a registered caller with two unread messages from two different senders
    And one of those two messages carries a subject
    When it runs mail hook --event SessionStart
    Then the payload carries the heading "Unread mail (2)"
    And each message line names its sender, its body, and its message id
    And the subject-carrying message's line also names its subject

  Scenario: a message with no subject renders without a subject segment
    Given a registered caller with one unread message that carries no subject
    When it runs mail hook --event SessionStart
    Then that message's line places the body directly after the sender, with no segment between them
    And the payload carries the heading "Unread mail (1)"

  Scenario: an acked message of the caller's own no longer surfaces
    Given a registered caller with two messages addressed to it
    And one of those two messages has been acked
    When it runs mail hook --event SessionStart
    Then the payload carries the heading "Unread mail (1)"
    And the payload lists the still-unread message
    And the payload does not list the acked message

  Scenario: surfacing the caller's own mail never acks it
    Given a registered caller with one unread message
    When it runs mail hook --event SessionStart twice
    Then that message is listed in both payloads
    And it is still unread in the caller's inbox after both calls

  Scenario: a caller whose id resolves without an agent record still gets its own mail
    Given an agent id whose registry record was removed while its inbox was kept
    And one unread message sitting in that inbox
    And a session whose CYBERLEGION_AGENT_ID environment variable names that id
    And that session is in a multiplexer pane with no main pane bound
    And a standing owner homa with one unread message
    When it runs mail hook --event SessionStart
    Then the payload lists the caller's own unread message
    And the payload contains no owner-mail section

  # ── Owner mail surfaces into the bound main pane, never into a spawned unit ──

  Scenario: the bound main pane surfaces the owner's unread mail with bodies
    Given a standing owner homa with one unread message
    And a registered top-level session in the pane bound as the hub's main pane
    And one unread message addressed to that session
    When the main pane runs mail hook --event SessionStart
    Then the payload includes homa's unread message with its body under an owner-mail heading naming homa
    And the caller's own message is listed under a separate "Unread mail" heading

  Scenario: a root session that is not the bound main pane does not surface owner mail
    Given a standing owner homa with one unread message
    And the hub's main pane bound to one pane
    And a second registered top-level session in a different pane
    And one unread message addressed to that second session
    When the second session runs mail hook --event SessionStart
    Then the payload lists the second session's own unread message
    And the payload contains no owner-mail section

  Scenario: a root session in no multiplexer pane surfaces no owner mail once a main pane is bound
    Given a standing owner homa with one unread message
    And the hub's main pane bound to a pane
    And a registered top-level session in no multiplexer pane
    And one unread message addressed to that session
    When it runs mail hook --event SessionStart
    Then the payload lists that session's own unread message
    And the payload contains no owner-mail section

  Scenario: with no main pane bound, any root session still surfaces owner mail
    Given a standing owner homa with one unread message
    And no main pane bound
    And a registered top-level session that was not spawned by another agent
    When the top-level session runs mail hook --event SessionStart
    Then the payload includes homa's unread message under an owner-mail heading naming homa

  Scenario: a spawned unit does not surface the owner's mail
    Given a standing owner homa with one unread message
    And a registered session whose record carries a spawnedBy
    And one unread message addressed to that spawned session
    When the spawned unit runs mail hook --event SessionStart
    Then the payload lists the spawned unit's own unread message
    And the payload contains no owner-mail section

  Scenario: every standing owner with unread mail gets its own heading
    Given a standing owner homa with one unread message
    And a second standing owner iris with one unread message
    And no main pane bound
    And a registered top-level session
    When it runs mail hook --event SessionStart
    Then the payload carries an owner-mail heading naming homa that lists homa's message
    And the payload carries a separate owner-mail heading naming iris that lists iris's message

  Scenario: surfacing the owner's mail never acks it
    Given a standing owner homa with one unread message
    And a registered top-level session in the pane bound as the hub's main pane
    When the main pane runs mail hook --event SessionStart twice
    Then homa's message is surfaced in both payloads
    And it is still unread in homa's inbox after both calls

  Scenario: an acked owner message no longer surfaces
    Given a standing owner homa whose only message has been acked
    And a registered top-level session in a pane with no main pane bound
    And one unread message addressed to that session
    When it runs mail hook --event SessionStart
    Then the payload lists that session's own unread message
    And the payload contains no owner-mail section

  Scenario: no standing owner means no owner-mail section
    Given a hub registry holding only non-standing records
    And a registered top-level session
    And one unread message addressed to that session
    When it runs mail hook --event SessionStart
    Then the payload lists that session's own unread message
    And the payload contains no owner-mail section
    And the command exits 0

  Scenario: a failing main-pane lookup drops the owner-mail section but keeps the caller's own mail
    Given a registered top-level session in no multiplexer pane
    And one unread message addressed to that session
    And a standing owner homa with one unread message
    And a hub store whose main-pane lookup raises an error
    When it runs mail hook --event SessionStart
    Then the payload lists that session's own unread message
    And the payload contains no owner-mail section
    And the command exits 0

  Scenario: a failing registry read drops the owner-mail section but keeps the caller's own mail
    Given a registered top-level session in no multiplexer pane
    And one unread message addressed to that session
    And a standing owner homa with one unread message
    And no main pane bound
    And a hub store whose registry listing raises an error
    When it runs mail hook --event SessionStart
    Then the payload lists that session's own unread message
    And the payload contains no owner-mail section
    And the command exits 0

  # ── The payload assembles every accumulated section ──

  Scenario: a caller with an empty inbox injects nothing
    Given a registered top-level session in the pane bound as the hub's main pane
    And every message addressed to that session has been acked
    And a standing owner homa whose messages have all been acked
    When it runs mail hook --event SessionStart
    Then stdout is empty
    And the command exits 0

  Scenario: an unbound root pane with nothing unread injects nothing
    Given a registered top-level session in a pane with no main pane bound
    And no standing owner record
    And no unread message addressed to that session
    When it runs mail hook --event SessionStart
    Then stdout is empty
    And the command exits 0

  Scenario: a non-multiplexer root session with no standing owner and nothing unread injects nothing
    Given a registered top-level session in no multiplexer pane
    And a hub registry holding only non-standing records
    And no unread message addressed to that session
    When it runs mail hook --event SessionStart
    Then stdout is empty
    And the command exits 0

  Scenario: the payload uses the harness hookSpecificOutput shape as raw JSON
    Given a registered caller with unread mail
    When it runs mail hook --event SessionStart
    Then stdout is parseable JSON shaped as hookSpecificOutput with hookEventName and additionalContext
    And it is not TOON-formatted

  Scenario: own mail and owner mail appear in one payload in that order
    Given a standing owner iris with one unread message
    And a registered top-level session in a pane with no main pane bound
    And one unread message addressed to that session
    When it runs mail hook --event SessionStart
    Then the payload carries an "Unread mail" heading and an owner-mail heading naming iris
    And the "Unread mail" heading appears before the owner-mail heading
    And a blank line separates the two sections
    And no section follows the owner-mail section

  Scenario: an unbound root pane surfaces owner mail without an unread-mail section
    Given a standing owner homa with one unread message
    And no main pane bound
    And a registered top-level session in a pane
    And every message addressed to that session has been acked
    When it runs mail hook --event SessionStart
    Then the payload includes homa's unread message under an owner-mail heading naming homa
    And the payload carries no "Unread mail" heading
    And the owner-mail section is the only section in the payload

  # ── No brief is injected, whatever the peer's record carries ──

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
