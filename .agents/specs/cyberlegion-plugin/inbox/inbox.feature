@frozen
Feature: manage-inbox — the human's review of the standing owner mailbox
  Unit suite for the manage-inbox skill: a thin, user-invocable wrapper over the cyberlegion CLI's
  owner-scoped mail commands. It resolves which standing owner's mailbox to act on, then lists,
  reads, acks, or replies in that mailbox as the human directs. Every mechanic is a cyberlegion CLI
  call. The CLI's own outcomes (read leaves a message unread, ack errors on an unknown or
  already-acked id, two concurrent acks yield one success, --owner on a non-standing handle errors)
  belong to the sibling packages/cyberlegion project's mail suite and are not restated here; this
  suite covers only the choices the skill makes. Spawning, messaging, or dispatching a peer is
  legate; creating or binding the owner identity is init-cyberlegion.

  # ── Triggering ──

  @trigger
  Scenario Outline: manage-inbox activates on an owner-mailbox review intent and defers its siblings
    Given a user query "<query>"
    When the agent decides whether to invoke manage-inbox
    Then invocation is "<should_trigger>"

    Examples:
      | query                                                              | should_trigger |
      | did any of the overnight cron agents leave me a report             | yes            |
      | show me what is waiting in my owner mailbox                        | yes            |
      | open the report the backup job sent and show me the body           | yes            |
      | I dealt with the disk-usage report, mark it read                   | yes            |
      | the migration agent asked which schema to keep, answer it: keep v2 | yes            |
      | send a message to the reviewer pane asking for its status          | no             |
      | wait for the peer on my right to reply on thread t-9               | no             |
      | make this pane the durable owner inbox for the legion              | no             |
      | dispatch the flaky-test triage to the investigator role            | no             |
      | clear my email inbox in the mail client                            | no             |

  Scenario: a peer message, spawn, or dispatch request defers to legate
    Given the user asks to message, spawn, or dispatch work to another agent session
    When manage-inbox classifies the request
    Then it does not handle the request and legate does

  Scenario: a request to create or bind the owner identity defers to init-cyberlegion
    Given the user asks to set up a durable owner inbox for this pane
    When manage-inbox classifies the request
    Then it runs no unit register --standing --handle command and init-cyberlegion handles the request

  # ── Resolving the owner handle ──

  @behavior
  Scenario: a set CYBERLEGION_OWNER names the mailbox without consulting the standing list
    Given CYBERLEGION_OWNER is set to "quartermaster"
    And the hub holds the standing owners "quartermaster" and "harbormaster"
    When the user asks to see what is waiting in their owner mailbox
    Then manage-inbox runs mail inbox --owner quartermaster and never runs a mail command with --owner harbormaster

  @behavior
  Scenario: a CYBERLEGION_OWNER naming no standing owner is reported, not replaced
    Given CYBERLEGION_OWNER is set to "quartermastr"
    And the only standing owner on the hub is "quartermaster"
    When the user asks to see what is waiting in their owner mailbox
    Then manage-inbox reports that "quartermastr" is not a standing owner and runs no mail command with --owner quartermaster

  @behavior
  Scenario: with CYBERLEGION_OWNER unset, the single standing owner is used without asking
    Given CYBERLEGION_OWNER is unset
    And the hub holds exactly one standing owner, "harbormaster"
    When the user asks to see what is waiting in their owner mailbox
    Then manage-inbox runs mail inbox --owner harbormaster without asking the user which owner to use

  @behavior
  Scenario: with no standing owner, the skill reports it and creates none
    Given CYBERLEGION_OWNER is unset
    And the hub holds no standing owner
    When the user asks to see what is waiting in their owner mailbox
    Then manage-inbox reports that no owner mailbox exists and runs neither unit register --standing --handle nor any mail command with --owner

  @behavior
  Scenario: with several standing owners and CYBERLEGION_OWNER unset, the skill stops and lists them
    Given CYBERLEGION_OWNER is unset
    And the hub holds the standing owners "quartermaster" and "harbormaster"
    When the user asks to see what is waiting in their owner mailbox
    Then manage-inbox runs no mail command with --owner, and its reply names both "quartermaster" and "harbormaster" and tells the user to set CYBERLEGION_OWNER to one of them

  # ── Listing what is waiting ──

  @behavior
  Scenario: a request for everything lists the whole owner mailbox
    Given the owner handle resolves to "harbormaster"
    When the user asks to see every report in their owner mailbox, read or not
    Then manage-inbox runs mail inbox --owner harbormaster without --unread

  @behavior
  Scenario: a request for only what is new lists unread owner mail
    Given the owner handle resolves to "harbormaster"
    When the user asks only for reports they have not handled yet
    Then manage-inbox runs mail inbox --owner harbormaster --unread

  # ── Reading without consuming ──

  @behavior
  Scenario: reading a report leaves it unread
    Given the owner handle resolves to "harbormaster"
    And the owner mailbox holds the unread message "m-4471" from a nightly certificate-expiry check
    When the user asks to read message "m-4471"
    Then manage-inbox runs mail read m-4471 --owner harbormaster without --ack and runs no mail ack for m-4471

  # ── Acking — the only read-state change ──

  @behavior
  Scenario: a report the user says is handled is acked in the owner mailbox
    Given the owner handle resolves to "harbormaster"
    And the owner mailbox holds the unread message "m-4471"
    When the user says they have dealt with message "m-4471"
    Then manage-inbox runs mail ack m-4471 --owner harbormaster

  @behavior
  Scenario: an ack the CLI rejects is reported as a failure, not as handled
    Given the owner handle resolves to "harbormaster"
    And mail ack m-4471 --owner harbormaster exits nonzero because m-4471 is already acked
    When the user says they have dealt with message "m-4471"
    Then manage-inbox's reply states the ack failed and does not state that m-4471 was cleared

  # ── Replying on a report's thread ──

  @behavior
  Scenario: an answer to a report's question goes back on that report's thread
    Given the owner handle resolves to "harbormaster"
    And the owner mailbox holds a report from the agent "schema-migrator" on thread "t-208" asking which schema to keep
    When the user answers that the agent should keep schema v2
    Then manage-inbox runs mail send --to schema-migrator --thread t-208 with the answer as the body
