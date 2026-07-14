@frozen
Feature: mail doorbell — wake the recipient on delivery
  The push counterpart to mail/surface's pull. On mail send, after the durable write, best-effort
  ring the recipient so it checks its inbox with no separate manual nudge — a peer agent's live
  session pane; a standing owner recipient (which has no session pane of its own) with a presence
  bound (unit claim), rung at that live unit's pane; or a standing owner with none, rung at the hub's
  bound main pane. The ring reuses the unit/lifecycle nudge submit-verify path (a taken turn, not
  fire-and-forget). Durable delivery is the guaranteed effect; the ring is best-effort on top — a
  recipient with no live pane, a standing owner with no bound presence and no bound main pane, or a
  ring that never
  completes is a legitimate no-op that never fails the send (mail stays store-and-forward and surfaces
  on the recipient's next SessionStart, mail/surface). The plain send/inbox primitives live in
  mail/core; the pull-side hook injection lives in mail/surface; the standalone unit nudge verb and
  its boot-race retry contract live in unit/lifecycle.

  # ── A peer recipient with a live pane is rung on delivery ──

  Scenario: sending to a peer with a live session pane rings that pane on delivery
    Given a registered peer recipient with a live session pane
    When the sender runs mail send --to <peer> --body "steer"
    Then the message lands in the peer's inbox
    And the peer's pane is rung with a check-your-inbox doorbell

  Scenario: the delivery doorbell is delivered as a taken turn, not fire-and-forget
    Given a peer whose first submit stages the doorbell unsent because its harness is still booting
    When the sender runs mail send --to <peer>
    Then the delivery ring re-submits the staged doorbell until the peer takes the turn
    And the doorbell is delivered exactly once

  Scenario: sending does not ring the sender's own pane
    Given a send whose recipient resolves to the sender's own session
    When the sender runs that mail send
    Then the message lands durably
    And no doorbell is delivered to the sender's own pane

  # ── The wake never fails the send ──

  Scenario: a recipient with no live pane is a store-and-forward no-op, not a send failure
    Given a registered peer recipient with no live session pane
    When the sender runs mail send --to <peer> --body "hi"
    Then the message lands durably in the peer's inbox
    And the send succeeds
    And no pane is rung

  Scenario: a delivery ring that never completes never fails the send
    Given a registered peer recipient whose pane keeps the doorbell staged past the retry cap
    When the sender runs mail send --to <peer>
    Then the message still lands durably and the send succeeds
    And the failed ring is reported as a best-effort warning, not a send error

  # ── A standing owner with a bound presence is rung there, never focus-gated ──

  Scenario: sending to a standing owner with a bound presence rings that unit's pane, not the main pane
    Given a standing owner inbox whose presence is bound to a live unit, and a different session bound as the hub's main pane
    When a session runs mail send --to <owner>
    Then the presence unit's pane is rung with the delivery doorbell
    And the bound main pane is not rung

  Scenario: a bound presence is rung even when nothing is focused
    Given a standing owner inbox whose presence is bound to a live unit that a mux client is not currently viewing
    When a session runs mail send --to <owner>
    Then the presence unit's pane is rung with the delivery doorbell

  Scenario: a standing owner whose presence unit has exited falls back to the bound main pane
    Given a standing owner inbox whose bound presence unit has exited, and a focused bound main pane
    When a session runs mail send --to <owner>
    Then the exited presence unit's pane is not rung
    And the bound main pane is rung with the delivery doorbell

  Scenario: a presence ring that never completes is a best-effort warning, not a send error
    Given a standing owner inbox whose presence is bound to a live unit that keeps the doorbell staged past the retry cap
    When a session runs mail send --to <owner>
    Then the message still lands durably in the owner inbox
    And the send reports a best-effort warning and succeeds

  Scenario: --no-nudge suppresses the doorbell to a standing owner's bound presence
    Given a standing owner inbox whose presence is bound to a live unit
    When a session runs mail send --to <owner> --no-nudge
    Then no pane is rung
    And the message still lands durably in the owner inbox

  # ── A standing owner recipient is notified at the bound main pane ──

  Scenario: sending to a standing owner rings the bound main pane so the human is notified on arrival
    Given a standing owner inbox and a session bound as the hub's main pane
    When a session runs mail send --to <owner> --body "report"
    Then the message lands in the owner inbox
    And the bound main pane is rung with an owner-mail doorbell

  Scenario: standing-owner mail with no bound main pane is a store-and-forward no-op
    Given a standing owner inbox and no main pane bound
    When a session runs mail send --to <owner> --body "report"
    Then the message lands durably in the owner inbox
    And the send succeeds
    And no pane is rung

  # ── The standing-owner ring gates on the bound main pane being focused (human present) ──

  Scenario: a standing-owner delivery does not ring the bound main pane when it is positively not focused
    Given a standing owner inbox and a bound main pane that a mux client is not currently viewing
    When a session runs mail send --to <owner> --body "report"
    Then the message lands durably in the owner inbox
    And the send succeeds
    And the bound main pane is not rung
    And the report stays queued in the owner inbox and surfaces on that pane's next SessionStart pull

  Scenario: a standing-owner delivery rings the bound main pane when it is focused
    Given a standing owner inbox and a bound main pane a mux client is currently viewing
    When a session runs mail send --to <owner> --body "report"
    Then the message lands in the owner inbox
    And the bound main pane is rung with an owner-mail doorbell

  Scenario: a standing-owner delivery rings when focus is unknown, and a probe error never fails the send
    Given a standing owner inbox and a bound main pane whose focus cannot be determined because the probe errors or the backend cannot report focus
    When a session runs mail send --to <owner> --body "report"
    Then the message lands durably in the owner inbox
    And the send succeeds
    And the bound main pane is rung with an owner-mail doorbell, since the ring is skipped only when the pane is positively not focused

  Scenario: a peer delivery ring is never focus-gated
    Given a registered peer recipient with a live session pane a mux client is not currently viewing
    When the sender runs mail send --to <peer> --body "steer"
    Then the peer's pane is rung with a check-your-inbox doorbell regardless of focus state

  # ── opt-out for a heads-down recipient ──

  Scenario: --no-nudge suppresses the delivery doorbell to a peer
    Given a registered peer recipient with a live session pane
    When the sender runs mail send --to <peer> --no-nudge
    Then the message lands durably in the peer's inbox
    And the peer's pane is not rung

  Scenario: --no-nudge suppresses the doorbell to a standing owner's bound main pane
    Given a standing owner inbox and a session bound as the hub's main pane
    When a session runs mail send --to <owner> --no-nudge
    Then the message lands durably in the owner inbox
    And the bound main pane is not rung
