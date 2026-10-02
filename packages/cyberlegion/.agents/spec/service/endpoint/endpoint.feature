@frozen
Feature: service endpoint — the durable address of a project service
  A project service's endpoint is a registry record of kind service with a deterministic id,
  svc-<project>-<name>. Its id and mailbox are the service's stable reference. It has no session,
  so it outlives every unit that owns the service. The first acquire creates it, and no verb deletes
  it. Who owns the service is the lease's concern, not this record's (ADR-0033).

  # ── creation ──

  Scenario: the first acquire of a service creates its endpoint record
    Given a registered project named "alpha" with no service "controller"
    When a caller runs service acquire alpha controller
    Then the registry holds a record with id svc-<project>-controller
    And the record has kind service, handle "controller@alpha", and service project and name set
    And the record's cwd is the project's root
    And the record has no pane, no harness, and status active

  Scenario: resolving a service that was never acquired creates no endpoint record
    Given a registered project with no service "controller"
    When a caller runs service resolve controller
    Then the command exits non-zero with an error saying there is no service "controller"
    And the registry holds no record with id svc-<project>-controller

  Scenario: an invalid service name creates no endpoint record
    Given a registered project
    When a caller runs service acquire with the name "Bad Name"
    Then the command exits non-zero with an error saying the service name is invalid
    And the registry holds no record of kind service

  Scenario: a later acquire reuses the endpoint record unchanged
    Given a service "controller" whose endpoint record exists
    When a caller runs service acquire controller again
    Then the endpoint record is unchanged
    And the registry holds exactly one record of kind service

  Scenario: a deleted endpoint record is recreated under the same id by the next acquire
    Given a service "controller" whose endpoint record was deleted from the hub
    When a caller runs service acquire controller
    Then the registry holds a record of kind service with id svc-<project>-controller

  # ── mail ──

  Scenario: mail sent to the endpoint's handle lands in the endpoint's inbox
    Given a service "controller" in project "alpha"
    When a peer runs mail send --to controller@alpha
    Then the message is in the endpoint's inbox as unread

  Scenario: mail sent to an endpoint rings no pane, even while the service has an owner
    Given a service whose owner unit has a session pane
    When a peer sends mail to the service's endpoint
    Then the delivery reports no ring and names no pane
    And no multiplexer backend is asked to ring anything

  Scenario: an endpoint's unread mail is not surfaced as owner mail
    Given a root session with no main pane bound
    And a standing owner with one unread message
    And a service endpoint with one unread message
    When the session's mail hook runs
    Then the payload holds the standing owner's message
    And the payload holds neither the endpoint's message nor the endpoint's handle

  Scenario: mail inbox --owner resolves the endpoint's handle to the endpoint's inbox
    Given a service "controller" in project "alpha"
    When a caller runs mail inbox --owner controller@alpha
    Then the inbox read is the endpoint's

  Scenario: mail inbox --owner fails loud on a handle that two endpoints share
    Given two repositories both named "alpha", each with a service "controller"
    When a caller runs mail inbox --owner controller@alpha
    Then the command exits non-zero with an error saying the handle names 2 service endpoints
    And mail inbox --owner with either endpoint's id reads that endpoint's inbox

  # ── lifecycle ──

  Scenario: the endpoint's id and pending mail survive replacing its owner
    Given a service owned by a unit, with one unread message in its endpoint's inbox
    When the owner's session is gone and another unit acquires and binds the service
    Then the service resolves to the same endpoint id
    And the endpoint's inbox still lists that message as unread

  Scenario: releasing a service keeps its endpoint record and pending mail
    Given a service owned by a unit, with one unread message in its endpoint's inbox
    When the owner runs service release
    Then the service's lease is vacant
    And the endpoint record is unchanged
    And the endpoint's inbox still lists that message as unread

  Scenario: prune never marks a service endpoint exited
    Given a service endpoint whose last-seen is a day old
    When a caller runs unit prune
    Then the endpoint record still has status active

  Scenario: unit close refuses a service endpoint, leaving its record and pending mail intact
    Given a service endpoint with one unread message
    When a caller runs unit close on the endpoint's id with --force
    Then the command exits non-zero with an error naming it a service endpoint
    And the endpoint record is unchanged
    And the endpoint's inbox still lists that message as unread
