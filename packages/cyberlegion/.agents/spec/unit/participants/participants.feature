Feature: unit participants — the hub's units mirrored into cynapse
  Every unit in the hub is registered as a cynapse participant, live while the unit exists and
  retired when it is gone (cyberuni/cyberlegion#153, stage 1). One idempotent pass reconciles the
  whole hub, so it also recovers from a crash. cynapse is optional: without it every step is a
  silent no-op (cyber-civitas decision 0001).

  # ── registering ──

  Scenario: a unit is registered as a live agent participant registered by its hub
    Given a hub with an active unit and an installed cynapse
    When the participants are synced
    Then cynapse holds a live agent participant keyed by the unit's id, named by its handle, registered by the hub's service participant

  Scenario: syncing twice changes nothing the second time
    Given a hub whose units were synced
    When the participants are synced again
    Then nothing is registered, retired or renamed

  Scenario: a stopped unit stays live
    Given a hub with a stopped unit
    When the participants are synced
    Then the unit's participant is live

  Scenario: an exited unit that was never registered is not registered
    Given a hub with an exited unit cynapse has never seen
    When the participants are synced
    Then cynapse holds no participant for it

  Scenario: a standing owner and a service endpoint are not mirrored
    Given a hub with a standing owner and a service endpoint and no units
    When the participants are synced
    Then cynapse holds no unit participant

  # ── retiring ──

  Scenario: an exited unit is retired
    Given a synced unit whose record is now exited
    When the participants are synced
    Then the unit's participant is retired

  Scenario: a unit whose record is gone is retired — a closed unit, or one lost to a crash
    Given a synced unit whose record has been removed
    When the participants are synced
    Then the unit's participant is retired

  Scenario: a hub never retires another hub's units
    Given two hubs sharing one cynapse store, each with a synced unit
    When the second hub syncs
    Then the first hub's unit participant is still live

  # ── renaming ──

  Scenario: a new handle renames the participant and resolves
    Given a synced unit whose handle is now "reviewer"
    When the participants are synced
    Then cynapse resolves "reviewer" to the unit's participant

  Scenario: a retired unit that comes back is revived under its current handle
    Given a unit whose participant was retired and whose record is active again under a new handle
    When the participants are synced
    Then the unit's participant is live with the new handle

  # ── through the CLI ──

  Scenario: unit register then unit close leave the participant live, then retired
    Given cynapse installed with its store in a fresh $CYNAPSE_HOME
    When a unit registers and is then closed
    Then its participant was live after the register and is retired after the close

  # ── optional ──

  Scenario: an install without cynapse registers and closes a unit and writes no cynapse store
    Given the CLI installed as a plugin copy with no cynapse to load
    When a unit registers and is then closed
    Then both commands exit 0 with no cynapse output and no cynapse store exists

  # ── the repository's native ID ──

  Scenario: the native ID is resolved from the origin remote through gh
    Given a repository whose origin remote gh resolves to a node id
    When the repository's subject is resolved
    Then the subject is the gh store with that node id

  Scenario: a repository with no origin remote has no subject and gh is never called
    Given a repository with no origin remote
    When the repository's subject is resolved
    Then there is no subject

  Scenario: a project reports the channel cynapse keys by its native ID
    Given a project whose native ID keys an existing cynapse channel
    When the project is shown
    Then the project reports that channel and records the native ID

  Scenario: without cynapse the native ID is never resolved
    Given a project and no cynapse to load
    When the project is shown
    Then gh is never called and no address is reported
