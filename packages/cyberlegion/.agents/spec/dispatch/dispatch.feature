@frozen
Feature: dispatch — result-slot primitives
  Delegate work and await a result without the CLI ever deciding how. `prep` allocates an id, a
  brief, and a result slot and returns an envelope — it spawns nothing and never invokes a harness
  Task tool. Two result channels exist and are never conflated: the SUBAGENT path's result channel
  is a result file (the parent's own Task tool blocks, the subagent writes the file, `dispatch
  collect` reads it back); the CHANNEL path's result channel is mail on the thread (an async peer
  `mail send`s, the caller `mail await`s or `dispatch channel --wait`s). `dispatch channel` is the
  one CLI-driven convenience — prep + `session spawn` a peer + optional await. Routing (warm-peer vs
  cold-subagent vs run-inline) belongs to the future Legate (`legion-gateway-legate`, CR-5), never to
  this CLI.

  # ── prep allocates and returns an envelope — it spawns nothing ──

  Scenario: prep mints an id, defaults thread to it, and writes the brief into the Store
    Given a brief given as --brief-text "review this"
    When it runs dispatch prep
    Then the envelope's thread equals its id
    And the brief is readable back from the Store under that id

  Scenario: an explicit --thread overrides the default
    Given --thread cr-42 is passed alongside a brief
    When it runs dispatch prep
    Then the envelope's thread is "cr-42" while its id is still freshly minted

  Scenario: prep computes the result-file path without creating it
    Given a successful prep call
    When the envelope is inspected
    Then resultFile is a path under the dispatch id and no file exists there yet

  Scenario: prep builds the subagent instruction from a resolved agent def
    Given --agent reviewer resolves a def with model, effort, and instructions
    When it runs dispatch prep --agent reviewer
    Then the instruction names the def's model and effort and inlines its instructions
    And the instruction mentions both the brief file path and the result file path

  Scenario: prep falls back to a generic instruction when no agent def is given
    Given no --agent or --agent-file is passed, only --role triager
    When it runs dispatch prep --role triager
    Then the instruction names the role and still mentions both the brief and result file paths

  Scenario: prep spawns nothing — no session, no pane, no agent record
    Given a successful prep call
    When the registry is inspected afterward
    Then no new agent record and no new session pane exist

  Scenario: an unresolvable --agent name fails loud rather than falling back to generic
    Given --agent ghost does not resolve to any def file
    When it runs dispatch prep --agent ghost
    Then the command errors naming "ghost" rather than silently building a generic instruction

  Scenario: prep requires a brief source
    Given neither --brief-text nor --brief-file is passed
    When it runs dispatch prep
    Then the command errors asking for a brief source

  # ── Two result channels exist and are never conflated ──

  Scenario: the subagent path's result is a file the parent's own Task tool waits on
    Given a parent that preps an envelope and spawns its own harness Task subagent with the instruction
    When the subagent writes its result JSON to the envelope's resultFile
    Then the parent reads it back via dispatch collect, never via mail

  Scenario: the channel path's result is mail on the thread, never a file
    Given a caller that runs dispatch channel --wait against a spawned peer
    When the peer replies with mail send --thread <id>
    Then the caller's result comes from the mail thread, and no result file is read

  # ── collect reads + validates the subagent path's result file ──

  Scenario: collect reads a written result file and returns the validated DispatchResult
    Given a result file already written at a dispatch's resultFile
    When it runs dispatch collect <id>
    Then it prints { id, verdict, body, ts } derived from that file's JSON

  Scenario: collect on a dispatch with no result file yet errors clearly
    Given a dispatch id whose result file has not been written
    When it runs dispatch collect <id>
    Then the command errors saying no result has been written yet, rather than printing an empty result

  # ── A result failing the verdict schema is an error, not a pass ──

  Scenario: invalid JSON in the result body is an error
    Given a result body that is not valid JSON
    When it is validated (by collect or channel --wait)
    Then the command errors saying the body is not valid JSON

  Scenario: a missing required key fails validation
    Given a --verdict-schema naming a required key the result body omits
    When the result is validated
    Then the command errors naming the missing required key

  Scenario: a primitive type mismatch fails validation
    Given a --verdict-schema declaring a key's type that the result body's value does not match
    When the result is validated
    Then the command errors naming the expected and actual type

  Scenario: an unreadable or invalid schema file is itself an error
    Given a --verdict-schema path that does not exist or is not valid JSON
    When validation runs
    Then the command errors about the schema file rather than silently skipping validation

  # ── dispatch channel is the one CLI-driven convenience ──

  Scenario: channel without --wait spawns the peer and returns the envelope
    Given dispatch channel --agent reviewer --brief-text "go" with no --wait
    When it runs
    Then a peer session is spawned realized from the reviewer def
    And the command prints the envelope, not a DispatchResult

  Scenario: channel --wait spawns the peer and returns the validated DispatchResult once the reply arrives
    Given dispatch channel --agent reviewer --brief-text "go" --wait
    And the peer eventually mail sends a reply on the dispatch's thread
    When the reply arrives
    Then the command prints the validated { id, verdict, body, ts }

  Scenario: session spawn --agent composes the def's realized launch
    Given session spawn --agent reviewer with no --harness
    When it runs
    Then the spawned peer's harness and launch command come from the reviewer def's realizeLaunch
    And an explicit --harness still overrides the def's own harness tag

  # ── channel errors without a multiplexer rather than silently degrading ──

  Scenario: channel with no tmux/herdr available errors rather than running inline
    Given no multiplexer is detected ($CYBERLEGION_MUX=none, no $TMUX, no $HERDR_ENV)
    When it runs dispatch channel --agent reviewer --brief-text "go"
    Then the command errors that a session backend is required
    And it never falls back to an in-process run or a different backend

  # ── The CLI never auto-selects a backend and never invokes Task ──

  Scenario: no dispatch verb accepts a --backend auto or spawns a headless subprocess
    Given the full dispatch --help output
    When it is inspected
    Then no verb offers backend auto-selection or headless-subprocess invocation

  Scenario: prep and collect never open a session or call a harness Task tool
    Given a full prep-then-collect round trip driven entirely by file I/O
    When both commands run
    Then neither opens a multiplexer session nor invokes any Task-tool-shaped call
