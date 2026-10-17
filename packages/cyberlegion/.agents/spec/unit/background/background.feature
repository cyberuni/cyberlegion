@frozen
Feature: unit background — a unit hosted in a Claude background session
  Outside a multiplexer a claude unit runs as a Claude Code background session (claude --bg). mux
  selects the backend; this node holds what spawn, nudge, read, show, stop, close, focus, clear, and
  restart do on a unit whose record carries the claude-bg locator. Worktree leasing and close's
  worktree rules stay in unit/lifecycle; prune and reconcile stay in unit/registry; the delivery ring
  stays in mail/doorbell.

  # ── unit spawn ──

  Scenario: a background spawn starts the session in the unit's folder with the spawn wake as its first prompt
    Given a caller in no multiplexer spawning a claude unit with a brief about pruning stale cache keys
    And the unit's leased worktree sits under a folder Claude Code trusts
    When the caller runs unit spawn --harness claude
    Then a claude --bg command was run with the unit's worktree as its working directory
    And that command's prompt is the spawn wake naming the unit's brief file path
    And the spawn result reports the first turn as delivered
    And no claude stop or claude --bg --resume command was run

  Scenario: a background spawn records the printed short id on the unit's record
    Given a caller in no multiplexer spawning a claude unit
    And claude --bg exits 0 printing "backgrounded · 9f8e7d6c · tidy-imports"
    When the caller runs unit spawn --harness claude
    Then the unit's record carries a locator tagged claude-bg
    And the locator's id is 9f8e7d6c

  Scenario: a background spawn starts the session with the unit's id and the CLI shim in its environment
    Given a caller in no multiplexer running the CLI from a known entry point
    When the caller runs unit spawn --harness claude
    Then the claude --bg command ran with CYBERLEGION_AGENT_ID set to the new unit's id
    And its PATH starts with the directory holding the unit's cyberlegion shim

  Scenario: a background spawn names the session after the unit's handle
    Given a caller in no multiplexer
    When the caller runs unit spawn --harness claude --handle ledger-audit
    Then the claude --bg command carries --name ledger-audit

  Scenario: a background spawn opens no multiplexer space whatever --at names
    Given a caller in no multiplexer
    When the caller runs unit spawn --harness claude --at pane:right
    Then the spawn succeeds through a claude --bg command
    And no multiplexer command was run

  Scenario: a background spawn refuses --no-wake before creating anything
    Given a caller in no multiplexer
    When the caller runs unit spawn --harness claude --no-wake
    Then it throws naming --no-wake as unsupported on a background session
    And no worktree was leased or created
    And no claude --bg command was run
    And no unit record was written

  Scenario: a background spawn refuses a launch that is not the claude command before creating anything
    Given a caller in no multiplexer
    When the caller spawns a claude unit through the library's spawn with the launch command "my-claude-wrapper --profile ops"
    Then it throws naming the launch as not the claude command
    And no worktree was leased or created
    And no claude --bg command was run
    And no unit record was written

  Scenario: a background spawn accepts a launch command that runs claude with its own flags
    Given a caller in no multiplexer
    When the caller spawns a claude unit through the library's spawn with the launch command "claude --model opus"
    Then a claude --bg command was run carrying --model opus
    And the unit's record carries a locator tagged claude-bg

  Scenario: a background spawn into an untrusted folder releases its worktree and registers nothing
    Given a caller in no multiplexer spawning a claude unit into a leased worktree
    And claude --bg exits 1 with stderr starting "Workspace not trusted."
    When the caller runs unit spawn --harness claude
    Then it throws naming the worktree's folder as the one to trust
    And the worktree lease the spawn acquired is released
    And no unit record was written

  Scenario: a --cwd background spawn into an untrusted folder registers nothing and names the folder
    Given a caller in no multiplexer spawning a claude unit with --cwd naming an existing folder
    And claude --bg exits 1 with stderr starting "Workspace not trusted."
    When the caller runs unit spawn --harness claude --cwd <folder>
    Then it throws naming that folder as the one to trust
    And no unit record was written
    And the folder still exists on disk

  Scenario: a background session that fails to start releases the worktree and registers nothing
    Given a caller in no multiplexer spawning a claude unit into a leased worktree
    And claude --bg exits 2 with stderr "background service unavailable"
    When the caller runs unit spawn --harness claude
    Then it throws carrying "background service unavailable"
    And the worktree lease the spawn acquired is released
    And no unit record was written

  Scenario: a background spawn whose output names no session releases the worktree and registers nothing
    Given a caller in no multiplexer spawning a claude unit into a leased worktree
    And claude --bg exits 0 printing "Starting background service…" and no backgrounded line
    When the caller runs unit spawn --harness claude
    Then it throws carrying "Starting background service…"
    And the worktree lease the spawn acquired is released
    And no unit record was written

  # ── unit nudge ──

  Scenario: nudge on an idle background unit resumes it with the message as its next prompt
    Given a background unit whose session the listing shows with status idle and state working, with session id 9f8e7d6c-1111-4222-8333-444455556666
    And the resume exits 0 saying it woke session 9f8e7d6c
    When a caller runs unit nudge <ref> --message "rebase onto main"
    Then claude stop was run with the short id 9f8e7d6c
    And then claude --bg --resume was run with 9f8e7d6c-1111-4222-8333-444455556666 and the prompt "rebase onto main"
    And the nudge reports success

  Scenario: nudge with no message rings an idle background unit with the default check-mail message
    Given a background unit whose session the listing shows with status idle
    And the resume exits 0 saying it woke the unit's short id
    When a caller runs unit nudge <ref>
    Then claude --bg --resume was run with the unit's session id and the default check-mail message as its prompt
    And the nudge reports success

  Scenario: nudge fails loud when the resume starts a copy instead of waking the unit
    Given a background unit whose session the listing shows with status idle
    And the resume exits 0 saying it started a copy under another short id
    When a caller runs unit nudge <ref>
    Then it throws that the unit was not woken
    And it does not report success

  Scenario: nudge fails loud and resumes nothing when the stop fails
    Given a background unit whose session the listing shows with status idle
    And claude stop exits non-zero for that short id
    When a caller runs unit nudge <ref>
    Then it throws carrying the stop's failure
    And no claude --bg --resume command was run

  Scenario: nudge on a busy background unit reports it busy and leaves the session running
    Given a background unit whose session the listing shows with status busy
    When a caller runs unit nudge <ref>
    Then it throws that the unit is busy and was not rung
    And no claude stop command was run

  Scenario: nudge on a blocked background unit reports it waiting on a person and leaves it untouched
    Given a background unit whose session the listing shows with status idle and state blocked
    When a caller runs unit nudge <ref>
    Then it throws that the unit is waiting on a person, naming claude attach with the unit's short id
    And no claude stop command was run

  Scenario: nudge on a background session reporting neither busy nor idle fails and stops nothing
    Given a background unit whose session the listing shows with no status and state failed
    When a caller runs unit nudge <ref>
    Then it throws that the session is not idle and was not rung
    And no claude stop command was run

  Scenario: nudge on a background unit whose session is gone fails naming it
    Given a background unit whose short id the listing does not contain
    When a caller runs unit nudge <ref>
    Then it throws naming the unit's short id as a session that no longer exists
    And no claude stop command was run

  Scenario: nudge fails and stops nothing when Claude Code's listing cannot be read
    Given a background unit whose record is active
    And the claude agents listing command exits non-zero
    When a caller runs unit nudge <ref>
    Then it throws that the session's state could not be read
    And no claude stop command was run

  Scenario: nudge on a stopped background unit is refused and runs no Claude command
    Given a background unit whose record has status stopped and still carries its claude-bg locator
    When a caller runs unit nudge <ref>
    Then it throws that the unit is stopped
    And no claude command was run

  # ── unit read ──

  Scenario: read prints a background unit's log without control sequences, bounded by --lines
    Given a background unit whose claude logs output holds 30 lines carrying terminal color and cursor sequences
    When a caller runs unit read <ref> --lines 5
    Then claude logs was run with the unit's short id
    And exactly the last 5 lines of that output are printed
    And the printed text carries no terminal escape sequence

  Scenario: read on a background unit whose log cannot be read fails naming the session
    Given a background unit whose claude logs command exits non-zero
    When a caller runs unit read <ref>
    Then it throws naming the unit's short id
    And nothing is printed to stdout

  # ── unit show ──

  Scenario: show reports a running background unit live with the controls that work on it
    Given a background unit whose session the listing shows with status busy
    When a caller runs unit show <ref>
    Then the result names the backend claude-bg
    And it reports liveness live
    And its controls are exactly nudge, read, stop, and close

  Scenario: show reports a background unit gone when the listing does not contain it
    Given a background unit whose record is active
    And the listing parses and does not contain the unit's short id
    When a caller runs unit show <ref>
    Then it reports liveness gone
    And its controls are exactly close

  Scenario: show offers only close for a stopped background unit
    Given a background unit whose record has status stopped and still carries its claude-bg locator
    When a caller runs unit show <ref>
    Then it reports liveness stopped
    And its controls are exactly close
    And no claude agents listing command was run

  Scenario: show reports a background unit's liveness unknown when the listing cannot be read
    Given a background unit whose record is active
    And the claude agents listing command exits non-zero
    When a caller runs unit show <ref>
    Then it reports liveness unknown
    And its controls are exactly close

  # ── unit stop ──

  Scenario: stop on a background unit stops the session and keeps its conversation and locator
    Given a background unit whose session the listing shows with status busy
    And the listing shows that session as stopped after claude stop runs
    When a caller runs unit stop <ref>
    Then claude stop was run with the unit's short id
    And no claude rm command was run
    And the unit's record has status stopped
    And the unit's record still carries its claude-bg locator with the same short id
    And the result reports the stop as verified

  Scenario: stop on a background unit whose session is gone marks it stopped
    Given a background unit whose short id the listing does not contain
    When a caller runs unit stop <ref>
    Then the unit's record has status stopped
    And the result reports the stop as verified

  Scenario: stop fails loud when the background session is still running after the stop
    Given a background unit whose session the listing shows with status busy
    And the listing still shows that session in a state other than stopped after claude stop runs
    When a caller runs unit stop <ref>
    Then it throws that the stop did not take effect
    And the unit's record status is unchanged

  Scenario: stop reports an unverified stop when the listing cannot be read
    Given a background unit whose session the listing shows with status busy
    And the claude agents listing command exits non-zero after claude stop runs
    When a caller runs unit stop <ref>
    Then the unit's record has status stopped
    And the result reports the stop as unverified

  # ── unit close ──

  Scenario: close on a background unit stops and deletes the session
    Given a background unit spawned with --cwd whose session the listing shows with status idle
    When a caller runs unit close <ref>
    Then claude stop was run with the unit's short id
    And then claude rm was run with the unit's short id
    And the unit's registry record is gone

  Scenario: close on a leased background unit releases the lease and deletes the session
    Given a background unit spawned with no --worktree-path, so it holds a worktree lease
    And its session the listing shows with status idle
    When a caller runs unit close <ref>
    Then the unit's worktree lease is released
    And the worktree is still on disk
    And claude stop was run with the unit's short id
    And then claude rm was run with the unit's short id
    And the unit's registry record is gone

  Scenario: a refused close leaves the background session untouched
    Given a background unit spawned with --worktree-path, so it holds no worktree lease
    And that worktree holds an uncommitted change to a tracked file
    When a caller runs unit close <ref> without --force
    Then it throws naming the uncommitted changes
    And no claude stop or claude rm command was run
    And the unit's registry record still exists

  Scenario: a close whose worktree removal fails leaves the background session untouched
    Given a background unit spawned with --worktree-path, so it holds no worktree lease
    And git worktree remove fails for that worktree
    When a caller runs unit close <ref> --force
    Then it throws carrying the removal failure
    And no claude stop or claude rm command was run
    And the unit's registry record still exists

  Scenario: close on a background unit whose session is gone still reaps the record
    Given a background unit spawned with --cwd
    And claude stop and claude rm both exit non-zero because Claude Code no longer has the session
    When a caller runs unit close <ref>
    Then the unit's registry record is gone
    And the close reports success

  # ── unit focus, clear, restart, rebind ──

  Scenario: focus on a background unit is refused naming claude attach
    Given a background unit whose session the listing shows with status idle
    When a caller runs unit focus <ref>
    Then it throws naming claude attach with the unit's short id as the way to open it
    And no claude or multiplexer command was run

  Scenario: clear on a background unit is refused and runs nothing
    Given a background unit whose session the listing shows with status idle
    When a caller runs unit clear <ref>
    Then it throws naming the background session backend as unsupported for clear
    And no claude command was run

  Scenario: restart on a background unit is refused and runs nothing
    Given a background unit whose record has status stopped
    When a caller runs unit restart <ref>
    Then it throws naming the background session backend as unsupported for restart
    And no claude command was run
    And the unit's record still has status stopped

  Scenario: rebind onto a background unit is refused and keeps its locator
    Given a caller inside a tmux pane
    And a background unit whose record has status stopped and carries a claude-bg locator with short id 5c4b3a29
    When the caller runs unit rebind <ref>
    Then it throws naming the background session backend as unsupported for rebind
    And the unit's record still carries the claude-bg locator with short id 5c4b3a29
    And the unit's record still has status stopped
