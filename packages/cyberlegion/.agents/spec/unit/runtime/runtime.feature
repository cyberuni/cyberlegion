@frozen
Feature: unit runtime — stop, restart, and rebind a unit's session without losing the unit
  A unit is durable work (id, handle, inbox, brief, worktree); its runtime is the harness session in
  a multiplexer pane. stop ends the runtime and keeps the unit, restart gives it a fresh runtime,
  rebind attaches a hand-started session, and show reports where the runtime is and what works on
  it without writing anything. Destructive teardown stays unit close (unit/lifecycle).

  # ── unit stop ──

  Scenario: stop tears down the session and keeps the unit's record, brief, and worktree
    Given a registered unit with a worktree on disk
    And the unit has a live session pane
    And the unit has a stored brief
    When a caller runs unit stop <id>
    Then the session pane is torn down
    And the unit's record has status stopped and no pane
    And the unit's record keeps its id, handle, harness, cwd, worktree, and last-seen time
    And the unit's brief file still holds its brief
    And the unit's worktree still exists on disk
    And the result reports the stop as verified

  Scenario: stop removes the unit's pane pointer
    Given a registered unit with a live session pane
    And the pane pointer for that pane names the unit
    When a caller runs unit stop <id>
    Then no pane pointer names the unit

  Scenario: stop leaves the unit's pending mail unread in its inbox
    Given a registered unit with a live session pane
    And the unit's inbox holds one unread message
    When a caller runs unit stop <id>
    Then the unit's inbox still lists that message as unread

  Scenario: mail sent to a stopped unit's handle lands in its inbox
    Given a registered unit with handle "worker" that has been stopped
    When a peer runs mail send --to worker
    Then the message is in the stopped unit's inbox as unread

  Scenario: stop fails loud when the backend still lists the pane, leaving the record unchanged
    Given a registered unit with a live session pane
    And a backend that still lists that pane after the teardown
    When a caller runs unit stop <id>
    Then the command exits non-zero with an error saying the stop did not take effect
    And the unit's record keeps status active and its pane

  Scenario: stop reports an unverified stop when the backend gives no pane list
    Given a registered unit with a live session pane
    And a backend that returns an empty pane list after the teardown
    When a caller runs unit stop <id>
    Then the unit's record has status stopped and no pane
    And the result reports the stop as unverified

  Scenario: stop treats a teardown that fails on an already-gone pane as a verified stop
    Given a registered unit whose record carries a herdr pane
    And a backend whose teardown call fails for that pane
    And the backend lists panes that do not include that pane
    When a caller runs unit stop <id>
    Then the command succeeds
    And the unit's record has status stopped and no pane
    And the result reports the stop as verified

  Scenario: stop marks a unit with no resolvable pane stopped and names no pane
    Given a registered unit whose record carries no pane locator
    And no pane pointer names the unit
    When a caller runs unit stop <id>
    Then no pane teardown is attempted
    And the unit's record has status stopped
    And the result names no pane

  Scenario: stop on an already-stopped unit changes nothing
    Given a registered unit with status stopped
    When a caller runs unit stop <id>
    Then the command succeeds reporting the unit as already stopped
    And the unit's record file is byte-identical to before

  Scenario: stop refuses the caller's own session
    Given a registered unit with a live session pane
    And the caller runs inside that unit's pane
    When the caller runs unit stop <id>
    Then the command exits non-zero with an error saying a unit cannot stop its own session
    And the unit's session pane is not torn down
    And the unit's record keeps status active and its pane

  Scenario: stop refuses a standing record
    Given a standing record with handle "owner"
    When a caller runs unit stop owner
    Then the command exits non-zero with an error saying the record has no runtime
    And the standing record is unchanged

  Scenario: stop refuses a service endpoint
    Given a project service endpoint record with handle "reviewer"
    When a caller runs unit stop reviewer
    Then the command exits non-zero with an error saying the record has no runtime
    And the service endpoint record is unchanged

  Scenario: stop on an unresolvable ref errors and tears nothing down
    Given a registered unit with a live session pane
    When a caller runs unit stop no-such-unit
    Then the command exits non-zero with an error naming "no-such-unit"
    And that unit's session pane is not torn down
    And that unit's record is unchanged

  # ── unit restart ──

  Scenario: restart replaces a live session and keeps the unit's id, handle, brief, and worktree
    Given a registered unit with a worktree on disk
    And the unit has a live session pane
    And the unit has a stored brief
    When a caller runs unit restart <id>
    Then the previous session pane is torn down
    And a new session opens with its cwd set to the unit's worktree
    And the unit's record has status active and the new pane
    And the unit's record keeps its id, handle, harness, and worktree
    And the unit's brief file still holds its brief
    And the result names both the previous pane and the new pane

  Scenario: restart opens a session for a stopped unit and binds it to the new pane
    Given a registered unit with status stopped
    When a caller runs unit restart <id>
    Then a new session opens with its cwd set to the unit's cwd
    And the unit's record has status active and the new pane
    And the pane pointer for the new pane names the unit
    And the unit's lastSeen is the time of the restart

  Scenario: restart revives an exited unit
    Given a registered unit with status exited
    And the unit's cwd exists on disk
    When a caller runs unit restart <id>
    Then a new session opens with its cwd set to the unit's cwd
    And the unit's record has status active and the new pane

  Scenario: restart launches with the command the unit was spawned with
    Given a stopped unit whose record carries the launch command "claude --model opus"
    When a caller runs unit restart <id>
    Then the new session's launch line runs "claude --model opus"

  Scenario: restart falls back to the harness's default command when none was recorded
    Given a stopped claude unit whose record carries no launch command
    When a caller runs unit restart <id>
    Then the new session's launch line runs the claude harness's default command

  Scenario: restart opens a unit with a worktree in its own workspace
    Given a stopped unit whose record carries a worktree
    When a caller runs unit restart <id>
    Then the new session opens with placement workspace

  Scenario: restart opens a --cwd unit in a tab
    Given a stopped unit whose record carries a cwd and no worktree
    When a caller runs unit restart <id>
    Then the new session opens with placement tab

  Scenario: after a restart the previous pane no longer resolves to the unit
    Given a registered unit with a live session pane
    And the pane pointer for that pane names the unit
    When a caller runs unit restart <id>
    Then no pane pointer for the previous pane names the unit

  Scenario: restart rings the new session to read its brief
    Given a registered unit with status stopped
    And the unit has a stored brief
    When a caller runs unit restart <id>
    Then a doorbell naming the unit's brief file path is submitted to the new pane
    And the result reports the ring as rung

  Scenario: restart --no-wake rings nothing
    Given a registered unit with status stopped
    When a caller runs unit restart <id> --no-wake
    Then nothing is submitted to any pane
    And the unit's record has status active and the new pane

  Scenario: a restart whose ring never completes still succeeds with a warning
    Given a registered unit with status stopped
    And a new session that never takes the doorbell turn
    When a caller runs unit restart <id>
    Then the command succeeds
    And the unit's record has status active and the new pane
    And the result carries a warning that the ring did not complete

  Scenario: a restart whose open fails leaves the unit stopped
    Given a registered unit with status stopped
    And the unit's inbox holds one unread message
    And a backend whose session open fails
    When a caller runs unit restart <id>
    Then the command exits non-zero with an error saying the unit is stopped and restart can be rerun
    And the unit's record has status stopped and no pane
    And the unit's inbox still lists that message as unread

  Scenario: a second restart recovers a unit left stopped by a failed restart
    Given a registered unit left stopped by a restart whose open failed
    And a backend whose session open now succeeds
    When a caller runs unit restart <id>
    Then the unit's record has status active and the new pane

  Scenario: a restart that dies after the open leaves the new session bound to the unit
    Given a registered unit with status stopped
    And a restart whose caller dies after the new session opens and before it binds the record
    When the new session's launch line runs in its pane
    Then the unit's record has status active and the new pane
    And the pane pointer for the new pane names the unit

  Scenario: restart opens nothing when the running session's stop does not take effect
    Given a registered unit with a live session pane
    And a backend that still lists that pane after the teardown
    When a caller runs unit restart <id>
    Then the command exits non-zero with an error saying the stop did not take effect
    And no new session is opened
    And the unit's record keeps status active and its pane

  Scenario: restart refuses a unit whose cwd no longer exists and tears nothing down
    Given a registered unit with a live session pane
    And the unit's cwd has been deleted from disk
    When a caller runs unit restart <id>
    Then the command exits non-zero with an error saying the unit's cwd is gone
    And the unit's session pane is not torn down
    And no new session is opened

  Scenario: restart refuses a harness outside the launch map and tears nothing down
    Given a registered unit with a live session pane
    And the unit's record names the harness "copilot"
    When a caller runs unit restart <id>
    Then the command exits non-zero with an error naming the launch map
    And the unit's session pane is not torn down
    And no new session is opened

  Scenario: restart refuses the caller's own session
    Given a registered unit with a live session pane
    And the caller runs inside that unit's pane
    When the caller runs unit restart <id>
    Then the command exits non-zero with an error saying a unit cannot restart its own session
    And the unit's session pane is not torn down
    And no new session is opened

  Scenario: restart refuses a standing record
    Given a standing record with handle "owner"
    When a caller runs unit restart owner
    Then the command exits non-zero with an error saying the record has no runtime
    And no new session is opened

  Scenario: restart refuses a service endpoint
    Given a project service endpoint record with handle "reviewer"
    When a caller runs unit restart reviewer
    Then the command exits non-zero with an error saying the record has no runtime
    And no new session is opened

  Scenario: restart on an unresolvable ref errors and opens nothing
    Given a registered unit with a live session pane
    When a caller runs unit restart no-such-unit
    Then the command exits non-zero with an error naming "no-such-unit"
    And that unit's session pane is not torn down
    And no new session is opened

  # ── unit rebind ──

  Scenario: rebind binds a stopped unit to the calling pane
    Given a registered unit with status stopped
    And the caller runs inside a herdr pane that no pane pointer names
    When the caller runs unit rebind <id>
    Then the unit's record has status active and the caller's pane
    And the pane pointer for the caller's pane names the unit
    And the unit's lastSeen is the time of the rebind

  Scenario: rebind drops the unit's old pane pointer
    Given a registered unit with status exited
    And a pane pointer for its old pane names the unit
    And the caller runs inside a different herdr pane that no pane pointer names
    When the caller runs unit rebind <id>
    Then no pane pointer for the old pane names the unit
    And the pane pointer for the caller's pane names the unit

  Scenario: rebind to the pane the unit already holds changes nothing
    Given a registered unit whose record carries the caller's herdr pane
    And the pane pointer for that pane names the unit
    When the caller runs unit rebind <id>
    Then the command succeeds
    And the unit's record file is byte-identical to before

  Scenario: rebind refuses a pane that belongs to another unit
    Given a registered unit with status stopped
    And the caller runs inside a herdr pane whose pane pointer names a different active unit
    When the caller runs unit rebind <id>
    Then the command exits non-zero with an error naming the other unit
    And the pane pointer for the caller's pane still names the other unit
    And the stopped unit's record keeps status stopped and no pane

  Scenario: rebind takes over a pane whose previous unit has exited
    Given a registered unit with status stopped
    And the caller runs inside a herdr pane whose pane pointer names a different exited unit
    When the caller runs unit rebind <id>
    Then the pane pointer for the caller's pane names the stopped unit
    And the stopped unit's record has status active and the caller's pane

  Scenario: rebind refuses a unit that still has a live pane
    Given a registered unit whose herdr pane the backend lists
    And the caller runs inside a different herdr pane that no pane pointer names
    When the caller runs unit rebind <id>
    Then the command exits non-zero with an error saying to stop the unit first
    And the unit's record keeps its original pane
    And no pane pointer for the caller's pane names the unit

  Scenario: rebind outside any pane refuses
    Given a registered unit with status stopped
    And the caller runs in no tmux or herdr pane
    When the caller runs unit rebind <id>
    Then the command exits non-zero with an error saying there is no pane to bind
    And the unit's record keeps status stopped and no pane

  Scenario: rebind refuses a standing record
    Given a standing record with handle "owner"
    And the caller runs inside a herdr pane that no pane pointer names
    When the caller runs unit rebind owner
    Then the command exits non-zero with an error saying the record has no runtime
    And no pane pointer for the caller's pane names the standing record

  Scenario: rebind refuses a service endpoint
    Given a project service endpoint record with handle "reviewer"
    And the caller runs inside a herdr pane that no pane pointer names
    When a caller runs unit rebind reviewer
    Then the command exits non-zero with an error saying the record has no runtime
    And no pane pointer for the caller's pane names the service endpoint

  Scenario: rebind on an unresolvable ref errors and binds nothing
    Given a registered unit with status stopped
    And the caller runs inside a herdr pane that no pane pointer names
    When the caller runs unit rebind no-such-unit
    Then the command exits non-zero with an error naming "no-such-unit"
    And no pane pointer names the caller's pane

  # ── unit show ──

  Scenario: show reports a live unit with its pane-driving controls
    Given a registered claude unit whose pane the backend lists
    And the unit's cwd exists on disk
    When a caller runs unit show <id> --format json
    Then the output's liveness is "live"
    And the output's pane names the unit's multiplexer and pane id
    And the output's controls are focus, nudge, read, clear, stop, restart, and close

  Scenario: show reports a gone pane without rewriting the recorded status
    Given a registered unit with status active
    And a backend that lists panes but not the unit's pane
    When a caller runs unit show <id> --format json
    Then the output's liveness is "gone"
    And the output's status is "active"
    And the output's controls include stop and rebind and exclude focus, nudge, and read

  Scenario: show reports unknown liveness for a unit with no pane
    Given a registered unit with status active whose record carries no pane locator
    And no pane pointer names the unit
    When a caller runs unit show <id> --format json
    Then the output's liveness is "unknown"
    And the output's controls exclude stop, focus, nudge, and read

  Scenario: show reports unknown liveness when the backend gives no pane list
    Given a registered unit with a pane locator
    And a backend that returns an empty pane list
    When a caller runs unit show <id> --format json
    Then the output's liveness is "unknown"
    And the output's controls include stop and exclude focus, nudge, and read

  Scenario: show reports a stopped unit with restart and rebind but no pane controls
    Given a registered claude unit with status stopped
    And the unit's cwd exists on disk
    When a caller runs unit show <id> --format json
    Then the output's liveness is "stopped"
    And the output's controls are restart, rebind, and close

  Scenario: show reports an exited unit with rebind but no pane controls
    Given a registered claude unit with status exited
    And the unit's record still carries its old pane locator
    And the backend lists that pane
    When a caller runs unit show <id> --format json
    Then the output's liveness is "exited"
    And the output's controls include rebind
    And the output's controls exclude focus, nudge, read, and stop

  Scenario: show omits clear for a harness with no honest reset command
    Given a registered unit whose record names the harness "gemini"
    And the backend lists the unit's pane
    When a caller runs unit show <id> --format json
    Then the output's controls include focus and exclude clear

  Scenario: show omits restart when the unit's cwd no longer exists
    Given a registered claude unit with status stopped
    And the unit's cwd has been deleted from disk
    When a caller runs unit show <id> --format json
    Then the output's controls exclude restart and include rebind

  Scenario: show reports no runtime and no controls for a standing record
    Given a standing record with handle "owner"
    When a caller runs unit show owner --format json
    Then the output's liveness is "none"
    And the output's controls are empty

  Scenario: show reports no runtime and no controls for a service endpoint
    Given a project service endpoint record with handle "reviewer"
    When a caller runs unit show reviewer --format json
    Then the output's liveness is "none"
    And the output's controls are empty

  Scenario: show leaves the target's record unchanged
    Given a registered unit whose pane the backend lists
    And the caller is a different registered unit
    When the caller runs unit show <id>
    Then the target unit's record file is byte-identical to before

  Scenario: show on an unresolvable ref errors
    Given a registered unit with a live session pane
    When a caller runs unit show no-such-unit
    Then the command exits non-zero with an error naming "no-such-unit"
