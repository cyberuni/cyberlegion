@frozen
Feature: identity — self-identify and discover peers
  Register this session, recover its own id, and list addressable peers over the global hub. Sending
  and reading mail live in mail; spawning/closing/nudging a peer session lives in session; hook-based
  injection lives in surfacing; thread correlation and the bounded mail await/watch live in wake.

  # ── Register records who and where ──

  Scenario: register writes the agent record and a pane pointer
    Given an unregistered session inside a tmux pane
    When it runs identity register --handle alice --harness claude
    Then the hub records an agent with handle=alice, harness=claude, status=active
    And the pane resolves to that agent's id

  Scenario: register stamps the hub root with the tracked marker
    Given a fresh, unmarked hub root
    When a session runs identity register --handle alice --harness claude
    Then the hub root's config.json marker exists

  Scenario: register is idempotent for the same pane
    Given a session already registered in the current pane
    When it runs identity register --harness claude again with no --handle
    Then it keeps the same id
    And the registry still holds exactly one agent

  Scenario: register fails cleanly when the registry cannot be written
    Given a hub root that cannot be created or written (its path is already a file)
    When a session runs identity register --handle a --harness claude
    Then the command throws
    And no agent record is written

  # ── whoami ──

  Scenario: whoami prints this session's own identity
    Given a session registered in the current pane
    When it runs identity whoami
    Then it prints that session's own id, handle, harness, and status

  Scenario: whoami errors when the session has no identity yet
    Given a session with no resolvable self id
    When it runs identity whoami
    Then the command errors asking the caller to run identity register first

  # ── who lists the addressable peers ──

  Scenario: who lists every non-exited peer with a definitive aggregate line
    Given two registered agents, alice and bob
    When a session runs identity who
    Then it lists both as a TOON agents list
    And the aggregate line reads "2 agents"

  Scenario: who reports a definitive empty state when nothing is registered
    Given an empty registry
    When a session runs identity who
    Then it reports "0 agents" rather than erroring

  Scenario: who excludes exited agents by default, --all includes them
    Given one active agent and one agent already marked exited
    When a session runs identity who
    Then only the active agent is listed
    When it runs identity who --all
    Then both agents are listed

  Scenario: the top-level who command behaves like identity who
    Given a registered agent alice
    When a session runs the top-level who command
    Then it lists alice exactly as identity who would

  # ── bare invocation is a content-first status (AXI #8) ──

  Scenario: bare cyberlegion prints a compact status and exits 0
    Given a session with no identity and an empty registry
    When it runs cyberlegion with no subcommand
    Then it prints a compact status with self "-", unread 0, and units 0
    And it exits 0 with a register next-step, never help-and-error

  Scenario: bare status reflects this session's own identity, unread, and live units
    Given a registered session alice holding one unread message and one live unit
    When it runs cyberlegion with no subcommand
    Then the status shows self alice, unread 1, and units 1

  # ── prune marks dead agents exited ──

  Scenario: prune marks an agent exited when its tmux pane is gone
    Given a registered agent whose tmux pane no longer exists
    When a session runs identity prune
    Then that agent's status becomes exited
    And it is included in the pruned list

  Scenario: prune marks an agent exited when its last-seen is stale
    Given a registered agent whose lastSeen is older than the staleness window
    When a session runs identity prune
    Then that agent's status becomes exited

  Scenario: prune leaves a live, recently-seen agent untouched
    Given a registered agent with a live pane and a fresh lastSeen
    When a session runs identity prune
    Then that agent's status remains unchanged
    And the pruned list is empty

  # ── Self-identity recovery ──

  Scenario: a later call recovers the agent's own id from its pane
    Given an agent registered in the current pane
    When any command resolves its own identity
    Then it resolves the id via the pane pointer without being told the id

  Scenario: $CYBERLEGION_AGENT_ID resolves self-id only when there is no $TMUX_PANE
    Given a session with no $TMUX_PANE and $CYBERLEGION_AGENT_ID=envid set
    When it resolves its own identity
    Then it resolves to "envid"

  Scenario: an unregistered pane does not fall back to $CYBERLEGION_AGENT_ID
    Given a session with $TMUX_PANE set to a pane with no pointer, and $CYBERLEGION_AGENT_ID also set
    When it resolves its own identity
    Then the resolved self id is undefined
    And it does not fall back to $CYBERLEGION_AGENT_ID

  # ── Harness detection ──

  Scenario: explicit --harness overrides detection
    Given a session with $CLAUDECODE set, registering with --harness codex
    When harness detection runs
    Then it reports codex regardless of the env signal

  Scenario: an unrecognized explicit --harness is rejected
    Given a register call with --harness grok
    When harness detection runs
    Then it throws naming the allowed values claude, cursor, codex

  Scenario Outline: harness-specific env vars are detected absent --harness
    Given a session with "<var>" set and no --harness
    When harness detection runs
    Then it reports "<harness>"

    Examples:
      | var       | harness |
      | CLAUDECODE| claude  |
      | CURSOR_X  | cursor  |
      | CODEX_X   | codex   |

  Scenario: absent env signals, the tmux pane's own running command is probed
    Given a session with $TMUX_PANE set and no harness-specific env vars, whose pane runs cursor-agent
    When harness detection runs
    Then it reports cursor

  Scenario: an undetectable harness requires --harness rather than guessing
    Given a register call with no --harness and no detectable harness signal at all
    When it runs identity register
    Then the command throws asking for --harness rather than recording a guessed harness

  # ── Every call touches last-seen ──

  Scenario: touch refreshes the caller's last-seen
    Given a registered agent with an old lastSeen
    When the caller runs a command that resolves its own identity (e.g. identity who)
    Then that agent's lastSeen is refreshed to now

  Scenario: touch is a no-op for an unregistered caller
    Given a session with no resolvable self id
    When touch runs
    Then it does not throw and writes nothing

  # ── Standing identity (a session-independent, prune-exempt owner inbox) ──

  Scenario: identity owner mints a standing record with a handle-derived stable id
    Given an empty registry
    When a session runs identity owner --handle homa
    Then the hub records an agent with handle=homa and kind=standing
    And its id is derived from the handle, not a random session id

  Scenario: registering the same owner handle again is idempotent
    Given a standing identity already registered for handle homa
    When a session runs identity owner --handle homa again
    Then it keeps the same id
    And the registry still holds exactly one standing record for homa

  Scenario: a standing record carries no tmux pane and is not pane-indexed
    Given a session runs identity owner --handle homa inside a tmux pane
    When the standing record is written
    Then the record has no tmux pane, window, or session
    And the current pane resolves to the caller's own session id, not the standing id

  Scenario: prune never marks a standing record exited even when its last-seen is stale
    Given a standing identity homa whose lastSeen is older than the staleness window
    When a session runs identity prune
    Then homa's status remains active
    And homa is not included in the pruned list

  Scenario: who lists a standing record alongside session agents
    Given a session agent alice and a standing identity homa
    When a session runs identity who
    Then both alice and homa are listed

  Scenario: an owner handle colliding with a live session resolves to the standing record
    Given a live session agent and a standing identity that share the handle homa
    When a recipient named homa is resolved
    Then it resolves to the standing record, not the live session

  Scenario: identity owner warns when a live session already claims that handle
    Given a live session agent registered with handle homa
    When a session runs identity owner --handle homa
    Then a standing record for homa is created
    And it warns that a live session already claims that handle

  Scenario: a record with no kind field is treated as a session
    Given a legacy agent record written before the kind field existed
    When its kind is evaluated
    Then it is treated as a session record
    And prune considers it for staleness like any session
