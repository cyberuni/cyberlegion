@frozen
Feature: mail core — durable inter-agent messaging
  Send, list, and read/ack/delete durable mail over the global hub's file queue. Thread correlation
  (send --thread/--reply-to, inbox --thread), mail await, and mail watch are wake-shaped behaviors
  layered on top of this plain send/inbox/read/ack/delete and are spec'd in mail/wait, not here.

  # ── send writes exactly one collision-free, time-ordered message ──

  Scenario: send writes exactly one message into the recipient's inbox
    Given a registered sender and recipient
    When the sender runs mail send --to <recipient> --body "ping"
    Then the recipient's inbox contains exactly one message with that body

  Scenario: the message id is collision-free and time-ordered
    Given two messages sent to the same recipient, one after the other
    When the recipient runs mail inbox
    Then the messages are listed oldest-first by their <epochMs>-<hex> id

  Scenario: two sends in the same millisecond do not clobber each other
    Given two messages sent to the same recipient at the same millisecond timestamp
    When the recipient runs mail inbox
    Then both messages are present as two distinct entries

  Scenario: a message is addressable to the recipient by handle or by id
    Given a registered recipient known by both a handle and an id
    When the sender sends one message addressed by handle and one addressed by id
    Then both messages land in that recipient's inbox

  Scenario: an unknown recipient errors with no partial write
    Given no agent addressable as "ghost"
    When the sender runs mail send --to ghost --body "hi"
    Then the command errors naming "ghost"
    And no inbox anywhere receives a message

  # ── The body is resolved from one of three sources ──

  Scenario Outline: the body comes from --body, --body-file <path>, or --body-file - (stdin)
    Given a send call providing the body via "<source>"
    When the body is resolved
    Then it equals "<expected>"

    Examples:
      | source              | expected  |
      | --body flag          | flag body |
      | --body-file <path>   | file body |
      | --body-file - (stdin)| stdin body|

  Scenario: neither --body nor --body-file given errors rather than sending an empty message
    Given a send call with no --body and no --body-file
    When the body is resolved
    Then it throws asking for --body or --body-file

  # ── inbox lists oldest-first with an aggregate ──

  Scenario: inbox lists the caller's mail oldest-first with a message/unread aggregate
    Given a caller with two unread messages sent in order
    When it runs mail inbox
    Then both are listed oldest-first
    And the aggregate line reads "2 messages (2 unread)"

  Scenario: inbox reports a definitive empty state
    Given a caller with no mail at all
    When it runs mail inbox
    Then it reports "0 messages (0 unread)" rather than erroring

  Scenario: --unread restricts the listing to un-acked mail
    Given a caller with one acked and one unread message
    When it runs mail inbox --unread
    Then only the unread message is listed

  Scenario: --from restricts the listing to one sender
    Given a caller with messages from two different senders
    When it runs mail inbox --from <sender>
    Then only that sender's messages are listed

  # ── read peeks — it does not consume ──

  Scenario: read prints the message body without acking it
    Given a caller with one unread message
    When it runs mail read <msg-id>
    Then the message body is printed
    And the message remains unread in a later mail inbox --unread

  Scenario: read on an unknown message id errors
    Given a message id that does not exist in the caller's inbox
    When it runs mail read <msg-id>
    Then the command errors that the message is not in this inbox

  # ── ack is the consumer ──

  Scenario: ack moves the message out of the unread set
    Given a caller with one unread message
    When it runs mail ack <msg-id>
    Then that message no longer appears in mail inbox --unread
    And it is reported as acked

  Scenario: acking an already-acked message errors
    Given a message the caller has already acked
    When it runs mail ack <msg-id> again
    Then the command errors that the message is not unread

  Scenario: acking an unknown message id errors
    Given a message id that does not exist in the caller's inbox
    When it runs mail ack <msg-id>
    Then the command errors rather than silently succeeding

  # ── Delete removes mail permanently ──

  Scenario: delete removes an unread message
    Given the calling agent has an unread message <msg-id>
    When it runs mail delete <msg-id>
    Then the message no longer appears in mail inbox at all

  Scenario: delete removes an already-acked message
    Given the calling agent has an already-acked message <msg-id>
    When it runs mail delete <msg-id>
    Then the message no longer appears in mail inbox at all

  Scenario: delete on an unknown message id errors rather than silently succeeding
    Given a message id that is not in the calling agent's inbox at all
    When it runs mail delete <msg-id>
    Then the command reports the message is not in this inbox

  # ── The standing owner mailbox is readable and ackable from any session ──

  Scenario: mail send to a standing owner delivers to the owner inbox
    Given a standing owner homa
    When a session runs mail send --to homa --body "report"
    Then exactly one message lands in homa's inbox

  Scenario: mail inbox --owner lists the owner mailbox from any session
    Given a standing owner homa holding two messages, and a caller with its own separate inbox
    When the caller runs mail inbox --owner homa
    Then it lists homa's two messages rather than the caller's own inbox

  Scenario: mail read --owner peeks the owner mailbox without consuming
    Given a standing owner homa with one unread message
    When a session runs mail read <id> --owner homa
    Then it prints the message body
    And the message remains unread in homa's inbox

  Scenario: mail ack --owner is the only thing that flips an owner message to read
    Given a standing owner homa with one unread message
    When a session runs mail ack <id> --owner homa
    Then the message moves into homa's read set

  Scenario: two concurrent acks of the same owner message — one wins
    Given a standing owner homa with one unread message
    When two sessions each run mail ack <id> --owner homa
    Then one ack succeeds and the other errors
    And the message is acked exactly once

  Scenario: mail --owner on a non-standing handle errors
    Given a handle that is a live session, not a standing owner
    When a session runs mail inbox --owner that-handle
    Then it errors rather than reading a session's inbox as an owner mailbox
