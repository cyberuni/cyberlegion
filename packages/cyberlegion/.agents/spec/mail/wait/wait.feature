@frozen
Feature: mail wait — thread correlation, bounded await, and watch
  Correlate a conversation across replies, block for a matching reply without risking a harness
  tool-timeout kill, and stream new mail without consuming it. Plain send/inbox/read/ack/delete live
  in mail/core; hook-based injection and owner-mail surfacing live in mail/surface; the routing
  brain that actually drives a turn lives in the future gateway (legion-gateway-legate).

  # ── Threads correlate a conversation ──

  Scenario: send persists --thread and --reply-to on the message
    Given a registered sender and recipient
    When the sender runs mail send --to <recipient> --body "answer" --thread cr-1 --reply-to <msg-id>
    Then the stored message records thread=cr-1 and replyTo=<msg-id>

  Scenario: --thread filters the inbox to messages carrying that thread
    Given the calling agent has messages on thread "cr-a", thread "cr-b", and no thread at all
    When it runs mail inbox --thread cr-a
    Then only the thread "cr-a" messages are listed

  Scenario: a threadless message is excluded from a --thread query
    Given the calling agent has one message with no thread
    When it runs mail inbox --thread cr-a
    Then that message is not listed

  Scenario: --thread composes with --unread and --from
    Given the calling agent has both acked and un-acked messages on thread "cr-a" from two senders
    When it runs mail inbox --thread cr-a --unread --from alice
    Then only the un-acked thread "cr-a" messages from alice are listed

  # ── Await blocks then reads, with three unambiguous outcomes ──

  Scenario: a match prints the body and acks it (block-then-read)
    Given a message arrives on thread "cr-1" while the caller is awaiting it
    When it runs mail await --thread cr-1
    Then the command exits 0, prints the message body, and the message is acked (moved out of the unread set)

  Scenario: --from narrows a --thread match to one sender
    Given two senders share thread "cr-1" but only one is passed to --from
    When it runs mail await --thread cr-1 --from <sender>
    Then only a message from that sender matches

  Scenario: --timeout elapsed with no match exits non-zero and prints nothing on stdout
    Given no message ever arrives on thread "cr-1"
    When it runs mail await --thread cr-1 --timeout 5000
    Then the command exits non-zero, prints a clear "no reply on thread" message on stderr, and acks nothing

  Scenario: --timeout 0 waits forever, bounded only by --max-wait per cycle
    Given no message has arrived yet
    When it runs mail await --thread cr-1 --timeout 0 --max-wait 1
    Then the command returns the clean "waiting" sentinel rather than exiting non-zero

  Scenario: hitting --max-wait before a match returns a clean, re-armable sentinel
    Given no message has arrived within the internal poll-cycle cap
    When it runs mail await --thread cr-1 --max-wait 5
    Then the command exits 0 with nothing on stdout and a distinct "waiting" line on stderr
    And the outcome is distinguishable from both "matched" and "timed-out"

  Scenario: re-arming after a "waiting" outcome still matches a message sent in between
    Given a first mail await call returned "waiting" and a message then arrived on the same thread
    When the caller runs mail await --thread cr-1 again
    Then this second call matches, prints the body, and acks it

  # ── Watch streams without consuming ──

  Scenario: watch prints only messages that arrive after it starts
    Given a message already in the inbox before mail watch starts, and one that arrives after
    When it runs mail watch --thread cr-1
    Then only the message that arrived after watch started is printed

  Scenario: watch never acks what it prints
    Given a message arrives while mail watch is running
    When mail watch prints it
    Then the message remains unread and is still returned by a later mail inbox --unread

  Scenario: watch composes with --thread and --from
    Given messages arrive on different threads and from different senders while watching
    When it runs mail watch --thread cr-1 --from alice
    Then only new messages matching both filters are printed
