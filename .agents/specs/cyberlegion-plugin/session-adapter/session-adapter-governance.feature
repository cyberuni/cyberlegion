@frozen
Feature: session-adapter-governance — verify observable effect or fail loud

  The ratified SessionAdapter design rule (doctrine entry 2, CR #162): a mutating
  operation — one that drives the multiplexer to change session state — must verify
  its observable effect actually landed before reporting success, and fail loud
  rather than report false success when it cannot. Effects come in two classes and
  the rule is applied per class, never as a mechanical copy across ops. Every
  scenario is verifiable against the shipped session-adapter-governance skill body
  and the enumerated conformance ledger it carries.

  # ── The rule ──

  Scenario: a mutating operation verifies its observable effect before reporting success
    Given a SessionAdapter operation that changes peer or session state
    When the governance is applied to that operation
    Then the operation must confirm the observable effect actually took hold before it reports success
    And an operation that cannot confirm its effect fails loud instead of reporting success

  Scenario: fire-and-forget success is prohibited
    Given a mutating operation implemented as a single send with no read-back
    When that operation is audited against the governance
    Then it is non-conformant, because it reports success regardless of whether the effect landed
    And the cited precedent is the cr150 nudge boot-race, where a swallowed Enter left the peer idle while the caller believed it started

  Scenario: read-only operations are out of scope
    Given the adapter operations read, paneExists, and listPanes
    When the governance's mutating-op definition is applied
    Then none of them is bound by the rule, because they change no session state

  Scenario: the rule binds the composite that reports success, not the raw primitive
    Given the raw adapter primitives send and submit
    When a composite operation built on them reports an outcome to its caller
    Then the verification duty sits on that composite
    And a raw primitive used inside a conformant verify loop is not itself required to verify

  # ── Effect classes ──

  Scenario: an unconditional effect is verified always
    Given an operation whose effect is observable regardless of who is watching
    When the governance classifies it
    Then its class is unconditional
    And its verification runs on every invocation, attended or headless

  Scenario: an attach-relative effect is verified only when its precondition holds
    Given an operation whose effect only exists when a client is attached
    When the governance classifies it
    Then its class is attach-relative
    And with no attached client there is nothing to move, so the operation no-ops cleanly
    And that no-op is reported as a legitimate no-op, not a failure

  Scenario: a naive read-back that ignores the attach precondition is non-conformant
    Given an attach-relative operation verified by an unconditional read-back
    When a headless or unattended spawn invokes it
    Then the read-back false-fails a legitimate no-op
    And the governance rejects that verification as non-conformant, because the class distinction is mandatory

  Scenario: a best-effort decoration still verifies and never fails silently
    Given a mutating ring that decorates an already-durable operation
    When the ring cannot complete within its verify-and-retry cap
    Then the failure surfaces explicitly as a warning on the result
    And the durable operation it decorates is never failed by the ring
    And the ring never reports a completed turn it did not verify

  Scenario: verify-before is necessary but not sufficient
    Given an operation that resolves and validates its target before issuing any state change
    When only that precondition check guards it
    Then the operation is not yet conformant for an unconditional effect, because resolve-or-throw proves the target existed, not that the effect landed

  # ── The conformance ledger ──

  Scenario: every mutating operation is enumerated with class and status
    Given the shipped session-adapter-governance skill
    When its conformance ledger is read
    Then every current SessionAdapter mutating operation appears with its effect class and its conformance status
    And nudge is enumerated unconditional and conformant as the reference pattern, submit-then-verify-then-retry that throws on the cap
    And focus is enumerated attach-relative and partial, verify-before shipped with the land-verify and no-attached-client no-op authorized as follow-up
    And clear is enumerated unconditional and non-conformant on verify-after, its injection a raw send with the fix authorized as follow-up
    And the mail-delivery doorbell is enumerated unconditional and conformant under the best-effort contract

  Scenario: a new mutating operation declares its class at its introducing change
    Given a change request that introduces a new SessionAdapter mutating operation or a composite over one
    When that change is specified
    Then the new operation declares its effect class and ships its class-matched verification in the same change
    And a deferred verification is recorded as an authorized follow-up in the conformance ledger, never left implicit

  Scenario: downstream changes cite the governance, not a peer's say-so
    Given a follow-up change implementing a per-op verification
    When it justifies the rule it builds against
    Then it cites session-adapter-governance as the authority
    And the rule binds by being loaded, not by being asserted in a peer relay
