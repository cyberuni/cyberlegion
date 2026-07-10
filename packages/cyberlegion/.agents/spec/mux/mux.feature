@frozen
Feature: mux — the unit-agnostic pane abstraction
  The multiplexer layer (the console/ code) legion depends on one-way: which backend (tmux/herdr)
  is available, where a new pane opens, and how a caller detects the multiplexer it is really
  running inside. Unit spawn/close/focus/nudge/read live in unit; hook surfacing lives in mail.

  # ── The session backend is selected by environment ──

  Scenario: $TMUX selects the tmux backend
    Given a caller with $TMUX set
    When unit spawn runs
    Then the new pane is opened through the tmux adapter

  Scenario: $HERDR_ENV with no $TMUX selects the herdr backend
    Given a caller with $HERDR_ENV set and no $TMUX
    When unit spawn runs
    Then the new pane is opened through the herdr adapter

  Scenario: neither tmux nor herdr detected errors before opening anything
    Given a caller with neither $TMUX nor $HERDR_ENV set
    When unit spawn runs
    Then it throws naming tmux/herdr as the required backend

  # ── Placement ──

  Scenario: --at chooses where the new session opens
    Given a caller running unit spawn --at pane:down
    When unit spawn runs
    Then the session opens at that placement

  Scenario: omitting --at defaults to pane:right
    Given a caller running unit spawn with no --at
    When unit spawn runs
    Then the session opens at pane:right

  # ── Multiplexer detection is two-mode ──

  Scenario: $CYBERLEGION_MUX is trusted outright as a fast-path
    Given $CYBERLEGION_MUX=tmux and $CYBERLEGION_MUX_PANE=%3 are set
    When the mux probe runs
    Then it reports mux=tmux, pane=%3, via=env, without walking the process ancestry

  Scenario: $CYBERLEGION_MUX=none is an override even inside a real multiplexer
    Given $CYBERLEGION_MUX=none is set while $TMUX is also set
    When the mux probe runs
    Then it reports mux=none

  Scenario: absent the env fast-path, the probe walks the process ancestry from $$
    Given no $CYBERLEGION_MUX is set and a tmux server is an ancestor of the current process
    When the mux probe runs
    Then it reports mux=tmux via=ancestry, found by walking ppid/comm up from the current pid

  Scenario: $TMUX/$HERDR_ENV alone are not trusted — only a fast-positive hint the walk falls back to
    Given $TMUX is set but the ancestry walk itself is inconclusive
    When the mux probe runs
    Then it falls back to the $TMUX hint rather than declaring no multiplexer

  Scenario: mux doctor reports the detected mux and prints a pin hint
    Given a caller running behind a detected multiplexer
    When it runs cyberlegion mux doctor
    Then it reports harness, mux, pane, hub root, and self-id
    And it prints an export CYBERLEGION_MUX=<m> hint so the caller can pin the fast-path

  Scenario: unit spawn propagates the fast-path to the spawned child
    Given a caller spawning a new peer session behind a detected multiplexer
    When cyberlegion unit spawn opens the new session
    Then the launched command's environment carries CYBERLEGION_MUX so the child does not re-discover

  # ── selectWakePath is a pure decision helper ──
  # DEPRECATED(cr-4): routing moves to the Legate plugin — selectWakePath and every scenario in
  # this group are recommended for CR-2 placement here (least disruption) but are a likely CR-4
  # move to the plugin alongside dispatch when routing leaves the CLI (migration-map.md judgment
  # call #3).

  Scenario: the portable default is a bounded await
    Given a harness with a multiplexer available but no special capability
    When selectWakePath runs
    Then it returns A-loop

  Scenario: Claude Code with an observable background task prefers A-prime
    Given the harness is claude and the task is observable
    When selectWakePath runs
    Then it returns A-prime

  Scenario: a live foreign session behind a verified mux prefers the doorbell
    Given a dedicated listener session behind a verified multiplexer
    When selectWakePath runs
    Then it returns B

  Scenario: B is never returned without a multiplexer
    Given mux.mux is 'none', even with every other condition for B or A-prime satisfied
    When selectWakePath runs
    Then it never returns B

  # ── mode reports the selected backend ──

  Scenario: mux mode reports the detected session backend
    Given a caller running inside a detected multiplexer
    When it runs cyberlegion mux mode
    Then it reports the selected session-backend name (tmux or herdr)

  Scenario: mux mode reports none when no backend is selectable
    Given a caller in no detectable multiplexer
    When it runs cyberlegion mux mode
    Then it reports "none" rather than erroring, and exits 0
