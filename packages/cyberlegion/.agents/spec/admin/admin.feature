Feature: admin — hub-state maintenance
  Moving a hub's state from one root into another — e.g. an old project-local root into the global
  hub. The onboarding front door lives in init; multiplexer diagnostics (doctor/mode) live in mux.

  # ── migrate merges one hub root into another ──

  Scenario: migrate merges agents, messages, and briefs into the destination
    Given a source hub with registered agents holding mail and briefs, and a separate destination hub
    When a caller runs cyberlegion admin migrate --from <source> --to <destination>
    Then the destination holds each source agent, its messages, and its briefs
    And it reports how many agents, messages, and briefs were migrated

  Scenario: migrate skips an agent record already present at the destination
    Given a source and destination that share an agent with the same id
    When migrate runs
    Then the destination's existing record for that id is left unchanged
    And that agent is not counted among the migrated agents

  Scenario: migrate carries an already-present agent's source mail even though its record is skipped
    Given a source and destination sharing an agent id, where the source holds mail for it
    When migrate runs
    Then that agent's source messages are still filed into the destination
    And they are counted among the migrated messages

  Scenario: migrate re-files every message into the destination unread set
    Given a source agent whose inbox holds both read and already-acked messages
    When migrate runs
    Then every migrated message lands in the destination's unread set
    And the source's read/unread split is not preserved

  Scenario: migrate stamps the destination hub with the tracked marker
    Given a fresh, unmarked destination hub root
    When migrate runs
    Then the destination root's tracked marker exists
