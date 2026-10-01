@frozen
Feature: prompt-guard — never type over a human's unsent draft
  Before the CLI types into a peer's input box (the delivery doorbell, the spawn first-turn
  doorbell, unit nudge, unit clear), it reads that box off the pane's plain-text scrape with the
  peer's harness shape. Whether to ring at all lives in mail/doorbell; the taken-turn contract
  lives in unit/lifecycle.

  # ── An empty or unrecognized box ──

  Scenario: an empty input box is typed into at once
    Given a peer pane whose input box shows only its idle placeholder
    When the CLI rings that pane
    Then the ring is typed without waiting

  Scenario: an unrecognized screen is typed into at once
    Given a peer pane showing no input box the reader recognizes
    When the CLI rings that pane
    Then the ring is typed without waiting

  # ── A draft the human is working on ──

  Scenario: a draft the human then sends is waited out and left untouched
    Given a peer pane whose input box holds a draft
    And the human sends the draft five seconds later
    When the CLI rings that pane
    Then the ring is typed only after the draft is gone
    And no keystroke other than the ring reaches the pane

  Scenario: a draft that keeps changing for 60 seconds is never typed over
    Given a peer pane whose input box holds a draft that changes every five seconds
    When the CLI rings that pane
    Then nothing is typed into the pane
    And the ring fails within 60 seconds naming the draft

  Scenario: a delivery doorbell blocked by a changing draft is a best-effort warning
    Given a peer recipient whose input box holds a draft that keeps changing
    When the sender runs mail send --to <peer>
    Then the message lands durably and the send succeeds
    And the send reports a best-effort warning naming the draft

  # ── A draft the human stepped away from ──

  Scenario: a draft unchanged for 20 seconds is cleared, the ring sent, and the draft typed back unsent
    Given a peer pane whose input box holds a one-row draft that does not change
    When the CLI rings that pane
    Then the box is cleared after 20 seconds
    And the ring is typed and taken
    And the draft is typed back into the box without pressing Enter

  Scenario: a change to the draft restarts the 20 second clock
    Given a peer pane whose draft changes once at 15 seconds and then stays put
    When the CLI rings that pane
    Then the ring is typed no earlier than 35 seconds in

  Scenario: the draft is typed back even when the ring fails
    Given a peer pane holding an idle one-row draft whose harness never takes the ring
    When the CLI rings that pane
    Then the draft is typed back into the box
    And the ring still reports its failure

  Scenario: an idle draft spanning several rows is left untouched
    Given a peer pane whose idle draft spans two rows
    When the CLI rings that pane
    Then nothing is typed into the pane
    And the ring fails naming the rows

  Scenario: text the clear cannot remove is treated as a placeholder
    Given a peer pane whose input box shows an unlisted placeholder that survives the clear
    When the CLI rings that pane
    Then the ring is typed
    And nothing is typed back after it
