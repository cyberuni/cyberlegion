@frozen
Feature: service lease — one fenced owner per project service
  A project service's lease records who owns the service now and at which fencing generation
  (services/<project>/<name>.json). Resolve-or-start is two steps: acquire either resolves a
  healthy owner or leaves one time-bounded reservation, and bind turns that reservation into
  ownership once the runtime exists. Every change of authority (a new reservation, a handoff)
  bumps the generation, and verify refuses any unit that is not the holder at the current
  generation (ADR-0033).

  # ── resolve-or-start ──

  Scenario: the first caller reserves a vacant service; a concurrent caller sees it starting, not a second reservation
    Given a registered project with no service "controller"
    When a first caller acquires controller and a second caller acquires it before any bind
    Then the first caller's outcome is reserved
    And the second caller's outcome is starting at the same generation as the reservation

  Scenario: binding the reservation makes one healthy owner that later callers resolve to
    Given a reservation for service "controller" and a live unit u1
    When u1 binds the reservation and a later caller acquires controller
    Then the later caller's outcome is resolved with holder u1 at the reserved generation
    And resolving controller reports health healthy

  Scenario: a failed start can be retried: an expired reservation is re-reserved under a new generation
    Given a reservation for service "controller" that was never bound
    And the reservation's time-to-live has passed
    When another caller acquires controller
    Then the outcome is reserved at the expired reservation's generation plus one
    And binding with the expired reservation's generation and token is refused as stale

  Scenario: a failed start released explicitly is retryable immediately
    Given a reservation for service "controller" that was never bound
    When the reservation is released with its generation and token
    And another caller acquires controller before the reservation would have expired
    Then the outcome is reserved

  Scenario: resolving a service never creates it
    Given a registered project with no service "controller"
    When a caller resolves controller
    Then the call throws that there is no service "controller"

  Scenario: a service name is a path-safe token
    Given a registered project
    When a caller acquires a service named "../escape"
    Then the call throws that the service name is invalid

  # ── a healthy owner is never silently stolen ──

  Scenario: acquire resolves to a healthy owner instead of reserving over it
    Given service "controller" owned by live unit u1
    When another caller acquires controller
    Then the outcome is resolved at u1's generation

  Scenario: an owner whose session is gone is recovered under a new generation, and the old owner is stale
    Given service "controller" owned by unit u1 whose session is gone
    When another caller acquires controller
    Then the outcome is reserved at u1's generation plus one
    And verifying u1 at its old generation is refused as stale

  Scenario: an exited owner is recovered even when its liveness cannot be probed
    Given service "controller" owned by a pane-less unit whose record has status exited
    When another caller acquires controller
    Then the outcome is reserved

  Scenario: forcing past a healthy owner is explicit and must name the current generation
    Given service "controller" owned by live unit u1
    When a caller acquires controller forcing the generation before the current one
    And a caller acquires controller forcing the current generation
    Then the first forced acquire is refused as stale
    And the second forced acquire is reserved at the current generation plus one

  Scenario: binding a unit that is not live is refused
    Given a reservation for service "controller" and a unit whose session is gone
    When the reservation is bound to that unit
    Then the bind is refused as unit-not-live

  # ── handoff and fencing ──

  Scenario: the holder hands off to another unit; the old holder is rejected afterwards
    Given service "controller" owned by live unit u1, and a live unit u2
    When u1 hands off to u2 at the current generation
    Then the holder is u2 at the old generation plus one
    And verifying u1 at the old generation is refused as stale
    And verifying u2 at the new generation succeeds with holder u2

  Scenario: only the current holder at the current generation can hand off
    Given service "controller" owned by live unit u1, and a live unit u2
    When u2 tries to hand off from itself at the current generation
    And u1 hands off to u2, then u1 tries to hand off again at the old generation
    Then u2's handoff is refused as stale
    And u1's second handoff is refused as stale

  Scenario: a stale holder cannot release the current owner
    Given service "controller" handed off from u1 to u2
    When u1 releases controller at its old generation
    Then the release is refused as stale
    And resolving controller reports holder u2

  # ── control is reported, never implied ──

  Scenario: an owner with no session pane resolves but reports that control is not recoverable
    Given service "controller" owned by a live unit with no session pane
    When a caller resolves controller
    Then the health is healthy and the control is none
    And the note says control is not recoverable

  Scenario: an owner with a session pane reports pane control
    Given service "controller" owned by a live unit with a session pane
    When a caller resolves controller
    Then the control is pane

  # ── startService composes acquire, launch, and bind ──

  Scenario: a vacant service is launched once and bound to the launched unit
    Given a registered project with no service "controller"
    When a caller starts controller with a launcher that creates unit fresh
    Then the outcome is started
    And the launcher ran once, at generation 1
    And resolving controller reports holder fresh

  Scenario: a healthy owner is resolved without launching anything
    Given service "controller" owned by live unit u1
    When a caller starts controller
    Then the outcome is resolved
    And the launcher never ran

  Scenario: two simultaneous starts launch one runtime; the other reports starting
    Given a registered project with no service "controller"
    When two callers start controller while the first launch is still in progress
    Then the second caller's outcome is starting
    And the first caller's outcome is started
    And the launcher ran once

  Scenario: a launch that throws releases its reservation, so the start can be retried at once
    Given a registered project with no service "controller"
    When a caller starts controller with a launcher that throws
    Then the start rejects with the launcher's error
    And resolving controller reports health vacant
    And the next acquire of controller is reserved

  Scenario: a launch that outlives its reservation is refused, naming the unit that is not the owner
    Given a registered project with no service "controller"
    When a caller starts controller with a launcher that runs past the reservation's time-to-live while another caller re-reserves
    Then the start rejects with an error naming the launched unit

  # ── owner liveness fails closed ──

  Scenario: a backend the caller cannot reach cannot declare the owner gone
    Given an active owner with a tmux pane
    And a tmux backend that answers with no pane list
    When the owner's liveness is checked
    Then the owner is live

  Scenario: a reachable backend that lists other panes but not the owner declares it gone
    Given an active owner with a tmux pane
    And a tmux backend that lists only another pane
    When the owner's liveness is checked
    Then the owner is not live

  Scenario: a reachable backend listing the owner pane keeps it live
    Given an active owner with a tmux pane
    And a tmux backend that lists the owner's pane
    When the owner's liveness is checked
    Then the owner is live

  Scenario: a stopped owner is never live, even with no pane to probe
    Given an owner with status stopped and no pane
    When the owner's liveness is checked
    Then the owner is not live

  Scenario: an exited owner is never live
    Given an owner with status exited and a tmux pane
    And a tmux backend that answers with no pane list
    When the owner's liveness is checked
    Then the owner is not live

  # ── CLI ──

  Scenario: concurrent service acquire from real processes: exactly one reservation, everyone else sees starting
    Given a registered project with no service "controller"
    When eight processes run service acquire controller at once
    Then every process exits zero
    And exactly one outcome is reserved and the other seven are starting
    And every outcome names generation 1

  Scenario: acquire → bind → verify → handoff, with the old owner rejected by verify
    Given two registered pane-less units, unit-one and unit-two
    When unit-one binds a fresh reservation, verifies at generation 1, and hands off to unit-two
    Then the bind reports state active, holder unit-one, health healthy, and control none
    And unit-one's verify at generation 1 succeeds before the handoff
    And unit-one's verify at generation 1 exits non-zero saying it is not the owner after the handoff
    And unit-two's verify at generation 2 exits zero

  Scenario: service resolve reports that a pane-less owner resolves without recoverable control
    Given service "controller" bound to a pane-less unit
    When a caller runs service resolve controller
    Then the output reports control none and says control is not recoverable

  Scenario: a stale bind fails loud and leaves the current reservation in place
    Given a reservation for service "controller"
    When a unit runs service bind with the reservation's generation and a wrong token
    Then the command exits non-zero saying the reservation is no longer current
    And resolving controller reports health starting

  Scenario: with no project argument, a service resolves the project of the current directory and registers it
    Given an unregistered repository "beta" with a linked worktree
    When a caller runs service acquire controller from the linked worktree with no project argument
    Then the outcome is reserved under the project id that project show beta reports
    And service resolve controller from the default checkout reports health starting

  Scenario: a vacant service spawns one peer with the spawn flags and binds it; a second start spawns nothing
    Given a registered project with no service "controller"
    When a caller runs service start controller with harness, task, and --no-wake flags
    And a caller runs service start controller again
    Then one peer was spawned, with the given harness and task and with no wake
    And the lease is active with the spawned peer as holder

  Scenario: a spawn that throws leaves the service vacant for an immediate retry
    Given a registered project with no service "controller"
    When a caller runs service start controller and the spawn throws
    Then the command exits non-zero
    And the lease is vacant
