@frozen
Feature: mux — the unit-agnostic pane abstraction
  The multiplexer layer (the console/ code) legion depends on one-way: which backend (tmux/herdr)
  is available, where a new pane opens, and how a caller detects the multiplexer it is really
  running inside. Unit spawn/close/focus/nudge/read live in unit; hook surfacing lives in mail.

  # ── The session backend is selected by environment ──
  # The backend is a parameter of one contract, not a second subject — one adapter per env.

  Scenario Outline: the session backend is selected by environment
    Given a caller with <env>
    When unit spawn runs
    Then the new pane is opened through the <adapter> adapter

    Examples:
      | env                         | adapter |
      | $TMUX set                   | tmux    |
      | $HERDR_ENV set and no $TMUX | herdr   |

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

  # ── mode reports the selected backend ──

  Scenario: mux mode reports the detected session backend
    Given a caller running inside a detected multiplexer
    When it runs cyberlegion mux mode
    Then it reports the selected session-backend name (tmux or herdr)

  Scenario: mux mode reports none when no backend is selectable
    Given a caller in no detectable multiplexer
    When it runs cyberlegion mux mode
    Then it reports "none" rather than erroring, and exits 0