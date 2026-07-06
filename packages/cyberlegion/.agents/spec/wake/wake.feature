@frozen
Feature: wake — thread correlation, bounded await, watch, and mux detection
  Wake a peer to a new turn without a shared process: thread-correlated mail (send/reply, thread
  filter, delete), a blocking mail await that self-caps under a harness tool-timeout, a non-acking
  mail watch stream, and the two-mode multiplexer probe a future gateway uses to choose between the
  bounded poll and the multiplexer doorbell. Sending and reading plain mail live in mail; the
  doorbell itself (session nudge) lives in session; hook surfacing lives in surfacing; the routing
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

  # ── Multiplexer detection is two-mode ──

  Scenario: $CYBERLEGION_MUX is trusted outright as a fast-path
    Given $CYBERLEGION_MUX=tmux and $CYBERLEGION_MUX_PANE=%3 are set
    When the mux probe runs
    Then it reports mux=tmux, pane=%3, via=env, without walking the process ancestry

  Scenario: $CYBERLEGION_MUX=none is an override even inside a real multiplexer
    Given $CYBERLEGION_MUX=none is set while $TMUX is also set
    When the mux probe runs
    Then it reports mux=none

  Scenario: absent the env fast-path, the probe walks the process ancestry from $$
    Given no $CYBERLEGION_MUX is set and a tmux server is an ancestor of the current process
    When the mux probe runs
    Then it reports mux=tmux via=ancestry, found by walking ppid/comm up from the current pid

  Scenario: $TMUX/$HERDR_ENV alone are not trusted — only a fast-positive hint the walk falls back to
    Given $TMUX is set but the ancestry walk itself is inconclusive
    When the mux probe runs
    Then it falls back to the $TMUX hint rather than declaring no multiplexer

  Scenario: admin doctor reports the detected mux and prints a pin hint
    Given a caller running behind a detected multiplexer
    When it runs cyberlegion admin doctor
    Then it reports harness, mux, pane, hub root, and self-id
    And it prints an export CYBERLEGION_MUX=<m> hint so the caller can pin the fast-path

  Scenario: session spawn propagates the fast-path to the spawned child
    Given a caller spawning a new peer session behind a detected multiplexer
    When cyberlegion session spawn opens the new session
    Then the launched command's environment carries CYBERLEGION_MUX so the child does not re-discover

  # ── selectWakePath is a pure decision helper ──

  Scenario: the portable default is a bounded await
    Given a harness with a multiplexer available but no special capability
    When selectWakePath runs
    Then it returns A-loop

  Scenario: Claude Code with an observable background task prefers A-prime
    Given the harness is claude and the task is observable
    When selectWakePath runs
    Then it returns A-prime

  Scenario: a live foreign session behind a verified mux prefers the doorbell
    Given a dedicated listener session behind a verified multiplexer
    When selectWakePath runs
    Then it returns B

  Scenario: B is never returned without a multiplexer
    Given mux.mux is 'none', even with every other condition for B or A-prime satisfied
    When selectWakePath runs
    Then it never returns B
