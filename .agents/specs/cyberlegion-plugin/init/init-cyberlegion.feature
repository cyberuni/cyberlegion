@frozen
Feature: init-cyberlegion — onboard a session into the Legion
  Unit suite for the init-cyberlegion skill: a thin, user-invocable onboarding wrapper that drives the
  cyberlegion CLI through probe (mux doctor) -> register the surfacing hook (init) -> detect a root
  session (!spawnedBy) -> ask before binding this pane as the durable legate owner inbox -> on an
  explicit yes, mint the owner (unit register --standing --handle legate) and bind the pane (attach).
  Every mechanic is a cyberlegion CLI call; the skill never touches the filesystem or hub state directly
  and never invents a config format. Spawning/mailing/dispatching a peer is legate; reading or acking
  owner mail is manage-inbox; the CLI mechanics themselves live in the sibling packages/cyberlegion
  project and are out of scope here.

  # ── Triggering ──

  @trigger
  Scenario Outline: init-cyberlegion activates on an onboarding intent and defers its siblings
    Given a user query "<query>"
    When the agent decides whether to invoke init-cyberlegion
    Then invocation is "<should_trigger>"

    Examples:
      | query                                                     | should_trigger |
      | set up cyberlegion in this session                        | yes            |
      | onboard the legion for this repo                          | yes            |
      | register the cyberlegion surfacing hook                   | yes            |
      | make this pane my main legion inbox                       | yes            |
      | get cyberlegion working in this repo                      | yes            |
      | spawn a claude peer to review this branch                 | no             |
      | check my owner inbox for any reports                      | no             |
      | dispatch this work to the reviewer role                   | no             |
      | init a git repo here                                      | no             |
      | run npm init for this package                             | no             |
      | install commit discipline in this repo                    | no             |

  Scenario: a peer spawn or mail request defers to legate
    Given the user asks to spawn, message, or dispatch another session
    When init-cyberlegion classifies the request
    Then it does not handle the request and legate does

  Scenario: an owner-inbox read request defers to manage-inbox
    Given the user asks to read or acknowledge their owner mail
    When init-cyberlegion classifies the request
    Then it does not handle the request and manage-inbox does

  Scenario: an unrelated init request is out of scope
    Given the user asks to initialize a git repo, an npm package, or commit discipline
    When init-cyberlegion classifies the request
    Then it does not handle the request and routes to the unrelated skill or declines

  # ── Probing the environment ──

  @behavior
  Scenario: the skill probes the environment before acting
    Given a user asks to set up cyberlegion in a fresh session
    When init-cyberlegion begins
    Then it runs cyberlegion mux doctor before registering the hook or minting any identity

  @behavior
  Scenario: root detection is derived from the probe, not guessed
    Given cyberlegion mux doctor reports a selfId whose spawnedBy is unset
    When init-cyberlegion determines whether this is a root session
    Then it treats the session as root based on the probe rather than asking the user to declare it

  # ── Registering the surfacing hook ──

  @behavior
  Scenario: the surfacing hook is registered through the CLI
    Given a session with no cyberlegion hook registered
    When init-cyberlegion registers the surfacing hook
    Then it runs cyberlegion init and does not edit any hook or settings file by hand

  @behavior
  Scenario: an already-registered hook is an idempotent no-op
    Given a session whose cyberlegion hook is already present
    When init-cyberlegion registers the surfacing hook
    Then cyberlegion init reports already present and the skill neither duplicates the hook nor errors

  @behavior
  Scenario: the agent flag is passed only when detection needs it
    Given cyberlegion mux doctor cannot auto-detect the harness or the user named one
    When init-cyberlegion registers the surfacing hook
    Then it runs cyberlegion init --agent with the resolved harness rather than plain cyberlegion init

  @behavior
  Scenario: the agent flag is omitted when auto-detect succeeds
    Given cyberlegion mux doctor auto-detects the harness and the user named none
    When init-cyberlegion registers the surfacing hook
    Then it runs plain cyberlegion init without an --agent flag

  # ── Detecting root vs spawned ──

  @behavior
  Scenario: a spawned non-root unit stops after the hook
    Given the probe reports a selfId whose spawnedBy is set
    When init-cyberlegion finishes registering the surfacing hook
    Then it stops without offering to bind a legate owner inbox

  @behavior
  Scenario: a hook-only request in a root session registers and stops
    Given a root session where the user asked only to register the surfacing hook
    When init-cyberlegion finishes registering the surfacing hook
    Then it stops without proceeding to the bind ask

  # ── Asking before binding (never silent) ──

  @behavior
  Scenario: a root session with no legate bound is asked before binding
    Given a root session (spawnedBy unset) with no legate owner bound yet
    When init-cyberlegion reaches the bind step
    Then it asks the user whether to bind this pane as the main legate owner inbox before doing anything

  @behavior
  Scenario: the skill never mints or binds the owner without an explicit yes
    Given a root session where init-cyberlegion has asked whether to bind and the user declines
    When init-cyberlegion continues
    Then it runs neither cyberlegion unit register --standing nor cyberlegion attach and leaves the registered hook in place

  @behavior
  Scenario: a root session that already has a legate bound is not re-asked
    Given a root session where a legate owner is already bound
    When init-cyberlegion reaches the bind step
    Then it does not ask to bind again and does not re-mint the owner

  # ── Minting and binding on yes ──

  @behavior
  Scenario: an explicit yes mints the owner and binds the pane
    Given a root session with no legate bound where the user agrees to bind this pane
    When init-cyberlegion performs the bind
    Then it runs cyberlegion unit register --standing --handle legate and then cyberlegion attach

  # ── Non-mux parity ──

  @behavior
  Scenario: a no-pane environment still mints the owner and does not error
    Given a root session whose probe reports no multiplexer or pane and the user agrees to bind
    When init-cyberlegion performs the bind
    Then it still runs cyberlegion unit register --standing --handle legate, attach is a no-op, and the skill completes without erroring

  @behavior
  Scenario: the skill never touches hub state or a config format directly
    Given any onboarding run of init-cyberlegion
    When it performs probe, hook registration, minting, or binding
    Then every mechanic is a cyberlegion CLI call and the skill writes no hub file and invents no config format

  # ── Quality of the onboarding ──

  @quality @rubric
  Scenario: the onboarding is CLI-delegated, environment-grounded, and consent-gated
    Given a root session in a repo where the user asks to set up cyberlegion
    When init-cyberlegion runs the full onboarding flow
    Then the judge evaluates the onboarding against the rubric
      """
      dimensions:
        - name: environment_summary_grounded_in_probe
          max: 3
        - name: bind_ask_is_informed_consent_not_silent
          max: 3
        - name: every_mechanic_delegated_to_the_cli
          max: 2
        - name: non_coercive_respects_a_decline
          max: 2
      threshold: 8
      """
    And the rubric score is at least the threshold
