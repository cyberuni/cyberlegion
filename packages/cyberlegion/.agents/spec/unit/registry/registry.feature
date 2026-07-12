@frozen
Feature: unit registry — register, discover, and prune legion units
  Register this session, recover its own id, discover addressable peers over the global hub, and
  reap dead ones. Sending and reading mail live in mail; spawning/closing a peer session lives in
  unit/lifecycle; the pane/backend layer lives in mux; hook-based injection lives in mail/surface;
  the human's read-pane pointer lives in attach.

  # ── Register records who and where ──

  Scenario: register writes the agent record and a pane pointer
    Given an unregistered session inside a tmux pane
    When it runs unit register --handle alice --harness claude
    Then the hub records an agent with handle=alice, harness=claude, status=active
    And the pane resolves to that agent's id

  Scenario: register writes the agent record and a pane pointer in a herdr pane
    Given an unregistered session inside a herdr pane (its pane id in $HERDR_PANE_ID)
    When it runs unit register --handle alice --harness claude
    Then the hub records an agent with handle=alice, harness=claude, status=active
    And the herdr pane resolves to that agent's id

  Scenario: register stamps the hub root with the tracked marker
    Given a fresh, unmarked hub root
    When a session runs unit register --handle alice --harness claude
    Then the hub root's config.json marker exists

  Scenario: register is idempotent for the same pane
    Given a session already registered in the current pane
    When it runs unit register --harness claude again with no --handle
    Then it keeps the same id
    And the registry still holds exactly one agent

  Scenario: register fails cleanly when the registry cannot be written
    Given a hub root that cannot be created or written (its path is already a file)
    When a session runs unit register --handle a --harness claude
    Then the command throws
    And no agent record is written

  # ── whoami ──

  Scenario: whoami prints this session's own identity
    Given a session registered in the current pane
    When it runs unit whoami
    Then it prints that session's own id, handle, harness, and status

  Scenario: whoami errors when the session has no identity yet
    Given a session with no resolvable self id
    When it runs unit whoami
    Then the command errors asking the caller to run unit register first

  # ── who lists the addressable peers ──
  # `unit who` (alias: top-level `who`) is the single list command — the old `session list` folded
  # in here (CR-2 resolution #1): fields id·handle·harness·status·pane, aggregate "N units", default
  # non-exited + --all.

  Scenario: who lists every non-exited unit with a definitive aggregate line
    Given two registered units, alice and bob
    When a session runs unit who
    Then it lists both as a TOON list with fields id, handle, harness, status, and pane
    And the aggregate line reads "2 units"

  Scenario: who reports a definitive empty state when nothing is registered
    Given an empty registry
    When a session runs unit who
    Then it reports "0 units" rather than erroring

  Scenario: who excludes exited agents by default, --all includes them
    Given one active agent and one agent already marked exited
    When a session runs unit who
    Then only the active agent is listed
    When it runs unit who --all
    Then both agents are listed

  Scenario: the top-level who command behaves like unit who
    Given a registered agent alice
    When a session runs the top-level who command
    Then it lists alice exactly as unit who would

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
    When a session runs unit prune
    Then that agent's status becomes exited
    And it is included in the pruned list

  Scenario: prune marks an agent exited when its herdr pane is gone
    Given a registered agent whose record locates a herdr pane that no longer exists
    When a session runs unit prune
    Then that agent's status becomes exited
    And it is included in the pruned list

  Scenario: prune leaves a live herdr-pane agent untouched
    Given a registered agent whose record locates a live herdr pane and a fresh lastSeen
    When a session runs unit prune
    Then that agent's status remains unchanged
    And the pruned list is empty

  Scenario: prune marks an agent exited when its last-seen is stale
    Given a registered agent whose lastSeen is older than the staleness window
    When a session runs unit prune
    Then that agent's status becomes exited

  Scenario: prune leaves a live, recently-seen agent untouched
    Given a registered agent with a live pane and a fresh lastSeen
    When a session runs unit prune
    Then that agent's status remains unchanged
    And the pruned list is empty

  # ── Self-identity recovery ──

  Scenario: a later call recovers the agent's own id from its pane
    Given an agent registered in the current pane
    When any command resolves its own identity
    Then it resolves the id via the pane pointer without being told the id

  Scenario Outline: the current multiplexer pane keys self-identity
    Given an agent registered in a <mux> pane addressed by its pane env var <var>
    When any command resolves its own identity
    Then it resolves that agent's id via the pane pointer without being told the id

    Examples:
      | mux   | var            |
      | tmux  | $TMUX_PANE     |
      | herdr | $HERDR_PANE_ID |

  Scenario: $CYBERLEGION_AGENT_ID resolves self-id only when the session is in no multiplexer pane
    Given a session in no multiplexer pane (no $TMUX_PANE and no $HERDR_PANE_ID) and $CYBERLEGION_AGENT_ID=envid set
    When it resolves its own identity
    Then it resolves to "envid"

  Scenario Outline: an unregistered multiplexer pane does not fall back to $CYBERLEGION_AGENT_ID
    Given a session in a <mux> pane with no pointer, and $CYBERLEGION_AGENT_ID also set
    When it resolves its own identity
    Then the resolved self id is undefined
    And it does not fall back to $CYBERLEGION_AGENT_ID

    Examples:
      | mux   |
      | tmux  |
      | herdr |

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
    When it runs unit register
    Then the command throws asking for --harness rather than recording a guessed harness

  # ── Every call touches last-seen ──

  Scenario: touch refreshes the caller's last-seen
    Given a registered agent with an old lastSeen
    When the caller runs a command that resolves its own identity (e.g. unit who)
    Then that agent's lastSeen is refreshed to now

  Scenario: touch is a no-op for an unregistered caller
    Given a session with no resolvable self id
    When touch runs
    Then it does not throw and writes nothing

  # ── Standing identity (a session-independent, prune-exempt owner inbox) ──

  Scenario: unit register --standing mints a standing record with a handle-derived stable id
    Given an empty registry
    When a session runs unit register --standing --handle homa
    Then the hub records an agent with handle=homa and kind=standing
    And its id is derived from the handle, not a random session id

  Scenario: registering the same owner handle again is idempotent
    Given a standing identity already registered for handle homa
    When a session runs unit register --standing --handle homa again
    Then it keeps the same id
    And the registry still holds exactly one standing record for homa

  Scenario: a standing record carries no tmux pane and is not pane-indexed
    Given a session runs unit register --standing --handle homa inside a tmux pane
    When the standing record is written
    Then the record has no tmux pane, window, or session
    And the current pane resolves to the caller's own session id, not the standing id

  Scenario: prune never marks a standing record exited even when its last-seen is stale
    Given a standing identity homa whose lastSeen is older than the staleness window
    When a session runs unit prune
    Then homa's status remains active
    And homa is not included in the pruned list

  Scenario: who lists a standing record alongside session agents
    Given a session agent alice and a standing identity homa
    When a session runs unit who
    Then both alice and homa are listed

  Scenario: an owner handle colliding with a live session resolves to the standing record
    Given a live session agent and a standing identity that share the handle homa
    When a recipient named homa is resolved
    Then it resolves to the standing record, not the live session

  Scenario: unit register --standing warns when a live session already claims that handle
    Given a live session agent registered with handle homa
    When a session runs unit register --standing --handle homa
    Then a standing record for homa is created
    And it warns that a live session already claims that handle

  Scenario: a record with no kind field is treated as a session
    Given a legacy agent record written before the kind field existed
    When its kind is evaluated
    Then it is treated as a session record
    And prune considers it for staleness like any session

  Scenario: bare unit register --standing lists the standing records
    Given two standing identities homa and ops
    When a session runs unit register --standing with no handle
    Then both homa and ops are listed
    And no session agents are listed

  # ── reconcile culls dead records against the live mux (cull half of reconcile-against-mux) ──

  Scenario: reconcile marks a record exited when its pane is absent from the live set
    Given a session inside a tmux pane and a registered agent whose tmux pane is not in the live tmux pane list
    When it runs unit who --reconcile
    Then that agent's status becomes exited
    And the change is returned

  Scenario: reconcile marks a record exited from within a herdr session too
    Given a session inside a herdr pane and a registered agent whose herdr pane is not in the live herdr pane list
    When it runs unit who --reconcile
    Then that agent's status becomes exited

  Scenario: reconcile is mux-scoped and never culls the other mux's records
    Given a session inside a tmux pane and a registered agent whose pane is a herdr pane absent from any live set
    When it runs unit who --reconcile
    Then the herdr-paned agent's status remains unchanged

  Scenario: reconcile never touches a standing record
    Given a session inside a tmux pane and a standing identity homa
    When it runs unit who --reconcile
    Then homa's status remains active

  Scenario: a pane-null record is not pane-culled by reconcile
    Given a session inside a tmux pane and a registered agent with pane null
    When it runs unit who --reconcile
    Then that agent's status remains unchanged by reconcile

  Scenario: reconcile outside any multiplexer pane culls nothing
    Given a session in no multiplexer pane
    When reconcile runs
    Then it returns no changes

  Scenario: prune reconcile-culls too
    Given a session inside a tmux pane and a registered agent whose tmux pane is not in the live tmux pane list
    When a session runs unit prune
    Then that agent's status becomes exited

  # ── reconcile adopts live-but-unregistered panes (adopt half of reconcile-against-mux) ──
  # Adopt runs only under `unit who --reconcile` (the reconcile operation); `prune` stays cull-only.
  # Only a pane whose backend reports a known harness is adoptable — herdr's `pane list` exposes the
  # running agent; tmux's does not, so tmux adoption is structurally deferred, not a gap.

  Scenario: reconcile adopts a live herdr pane with a detectable harness and no record
    Given a session inside a herdr pane and a live herdr pane running claude with no registry record
    When it runs unit who --reconcile
    Then a new agent record is minted for that pane with harness claude, status active, and a fresh lastSeen
    And that pane resolves to the new agent's id
    And the adopted unit is listed by who

  Scenario: an adopted record's handle derives from the pane's reported cwd basename
    Given a live unregistered herdr pane running claude whose cwd is /work/repos/feature-x
    When unit who --reconcile adopts it
    Then the minted record's handle is feature-x

  Scenario: an adopted pane with no reported cwd falls back to the id-prefix handle
    Given a live unregistered herdr pane running claude that reports no cwd
    When unit who --reconcile adopts it
    Then the minted record's handle is the first 6 characters of its new id

  Scenario: a pane whose reported agent is not a known harness is never adopted
    Given a session inside a herdr pane and a live herdr pane whose reported agent is gemini
    When it runs unit who --reconcile
    Then no record is minted for that pane

  Scenario: tmux panes are never adopted because tmux exposes no harness signal
    Given a session inside a tmux pane and a live unregistered tmux pane
    When it runs unit who --reconcile
    Then no record is minted for that pane

  Scenario: adopt is idempotent — a second reconcile mints no duplicate
    Given a herdr pane already adopted by a prior reconcile
    When unit who --reconcile runs again
    Then the registry still holds exactly one record for that pane

  Scenario: a live pane already bound to a registered agent is not re-adopted
    Given a registered agent whose herdr pane is live
    When it runs unit who --reconcile
    Then no second record is minted for that pane
    And that agent's status remains active

  Scenario: a live pane bound to an exited record is not adopted or resurrected
    Given a session inside a herdr pane and a live herdr pane running claude whose only record is already exited
    When it runs unit who --reconcile
    Then no new record is minted for that pane
    And the exited record remains exited

  Scenario: prune never adopts
    Given a session inside a herdr pane and a live unregistered herdr pane running claude
    When a session runs unit prune
    Then no record is minted for that pane

  # ── listPanes: the bulk enumeration primitive per mux ──

  Scenario: tmux listPanes reports every live pane's id and cwd
    Given tmux list-panes -a reports two panes with their ids and cwds
    When listPanes runs against the tmux adapter
    Then it returns both panes with their id and cwd, and no harness

  Scenario: herdr listPanes reports every live pane's id, harness, and cwd
    Given herdr pane list reports panes, some with an agent and one scaffold pane with no agent
    When listPanes runs against the herdr adapter
    Then it returns only the panes with an agent, each with id, harness, and cwd
    And the scaffold pane with no agent is dropped

