@frozen
Feature: mux — the unit-agnostic pane abstraction
  The multiplexer layer legion depends on one-way: which backend (tmux/herdr) is available, where a
  new pane opens, and how a caller detects the multiplexer it is really running inside. The mechanism
  is the cyber-mux package; this node specifies what legion holds it to, not how it drives a pane.
  Unit spawn/close/focus/nudge/read live in unit; hook surfacing lives in mail.

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

  # The multiplexer layer detects more backends than a unit record can carry. Which multiplexers a
  # pane locator can be stored under is unit/registry's to state, not this node's; the decision here
  # is only what selection does with a detected backend outside that set — refuse HERE, before
  # anything opens. Driving it would open a real pane the record could not name, leaving a live
  # session prune cannot reap and no caller can nudge. Refusing names the backend it found, so the
  # caller learns which one is unsupported rather than being told no multiplexer is running while
  # plainly inside one.

  Scenario Outline: a detected backend a unit record cannot carry is refused before opening anything
    Given a caller running inside <mux>
    And the probe detects <mux>
    And <mux> is outside the set unit/registry can store a pane locator under
    When unit spawn runs
    Then it throws naming <mux> as the detected-but-unsupported backend
    And no pane was opened on <mux>

    Examples:
      | mux     |
      | wezterm |
      | zellij  |

  # ── Placement ──

  Scenario: --at chooses where the new session opens
    Given a caller running unit spawn --at pane:down
    When unit spawn runs
    Then the session opens at that placement

  # A split is placed against a pane, and the backend's own default for "which pane" is the one the
  # HUMAN is viewing — which is only coincidentally the caller's, and diverges exactly when a program
  # is driving. spawn is always a program driving, so it names the pane rather than taking the default.

  Scenario: a pane placement splits the calling pane, not whichever pane is active
    Given a caller whose own pane is known from the fast-path vars
    And a different pane is the backend's currently active one
    When unit spawn --at pane:right runs
    Then the split names the caller's own pane as the pane it splits from

  # The spawn-mode-keyed default (new-worktree → workspace, --cwd → tab) lives in unit/lifecycle —
  # this layer only maps a resolved placement onto the backend, and unit spawn always resolves a
  # concrete --at before calling it. (The adapter keeps a defensive no-placement fallback to tab in
  # code, but it is unreachable from unit spawn and carries no user-observable behavior to spec.)

  # ── workspace — its own visible space, mapped to each backend's own-visible-space unit ──

  Scenario Outline: --at workspace opens the unit's own VISIBLE space on each backend
    Given a caller running unit spawn --at workspace with <env>
    When unit spawn runs
    Then the session opens in its own space that is visible in the attached client through the <adapter> adapter

    Examples:
      | env                         | adapter |
      | $TMUX set                   | tmux    |
      | $HERDR_ENV set and no $TMUX | herdr   |

  Scenario: tmux --at workspace opens a visible window in the current session, never a detached session
    Given a caller running unit spawn --at workspace with $TMUX set
    When unit spawn runs
    Then the tmux adapter opens a new window in the caller's current session, visible in its status bar
    And it does not open a detached (new-session) session the attached client cannot see or beam to

  Scenario: herdr --at workspace creates its own workspace nested under the source
    Given a caller running unit spawn --at workspace with $HERDR_ENV set and no $TMUX
    When unit spawn runs
    Then the herdr adapter creates a new workspace of its own, nested under the source workspace

  # ── A workspace placement is opened under a name the legion resolved ──
  # WHAT the name says is unit/lifecycle's; HOW a backend writes it onto its own tier is the
  # multiplexer package's, not this contract's. What legion holds it to is only the handoff: a
  # workspace placement opens under the resolved name, and a placement that opens into a space the
  # caller is already in carries none — the backend names whatever tier it opens, so a label passed
  # on a tab would rename the caller's own tab.

  Scenario: a workspace placement opens under the label the legion resolved
    Given spawn resolved the label 2B-retry-budget
    When unit spawn --at workspace runs
    Then the space-opening call carries 2B-retry-budget as the name for the space it opens

  Scenario: a pane or tab placement carries no name at all
    Given spawn resolved a label for a workspace placement
    When unit spawn --at tab runs instead
    Then the space-opening call carries no name, so the caller's own space keeps the name it had

  Scenario Outline: --at tab opens a new tab in the current window, never a split pane
    Given a caller running unit spawn --at tab with <env>
    When unit spawn runs
    Then the session opens as a new tab through the <adapter> adapter
    And the caller's current pane is not split

    Examples:
      | env                         | adapter |
      | $TMUX set                   | tmux    |
      | $HERDR_ENV set and no $TMUX | herdr   |

  Scenario: the tab placement opens in the background without stealing focus
    Given a caller running unit spawn --at tab
    When unit spawn runs
    Then the new tab is opened without moving input focus off the caller's session

  Scenario: --at accepts only pane:right, pane:down, tab, and workspace
    Given a caller running unit spawn
    When it passes an --at value outside pane:right|pane:down|tab|workspace
    Then the command is rejected before any session opens

  # ── Multiplexer detection is two-mode ──

  Scenario: $CYBER_MUX is trusted outright as a fast-path
    Given $CYBER_MUX=tmux and $CYBER_MUX_PANE=%3 are set
    When the mux probe runs
    Then it reports mux=tmux, pane=%3, via=env, without walking the process ancestry

  Scenario: $CYBER_MUX=none is an override even inside a real multiplexer
    Given $CYBER_MUX=none is set while $TMUX is also set
    When the mux probe runs
    Then it reports mux=none

  # A pane spawned before the namespace migration exports only the legacy pair. It is read one tier
  # BELOW the current pair and one tier ABOVE the ancestry walk: reading it keeps that already-running
  # session's identity resolvable instead of dropping it to a walk that answers for the wrong pane.
  # Transitional — deleted once no pre-migration pane is still alive.

  Scenario: a pane carrying only the legacy fast-path vars is still honored
    Given $CYBERLEGION_MUX=herdr and $CYBERLEGION_MUX_PANE=w1:p2 are set
    And $CYBER_MUX and $CYBER_MUX_PANE are unset
    When the mux probe runs
    Then it reports mux=herdr, pane=w1:p2, via=env — exactly as the current pair would

  Scenario: the current fast-path vars win over the legacy pair when both are set
    Given $CYBER_MUX=tmux and $CYBER_MUX_PANE=%3 are set
    And $CYBERLEGION_MUX=herdr and $CYBERLEGION_MUX_PANE=w1:p2 are also set
    When the mux probe runs
    Then it reports mux=tmux, pane=%3 — the legacy pair never overrides the current one

  Scenario: absent every env fast-path, the probe walks the process ancestry from $$
    Given $CYBER_MUX and $CYBERLEGION_MUX are both unset
    And a tmux server is an ancestor of the current process
    When the mux probe runs
    Then it reports mux=tmux via=ancestry, found by walking ppid/comm up from the current pid

  Scenario: $TMUX/$HERDR_ENV alone are not trusted — only a fast-positive hint the walk falls back to
    Given $CYBER_MUX and $CYBERLEGION_MUX are both unset
    And $TMUX is set but the ancestry walk itself is inconclusive
    When the mux probe runs
    Then it falls back to the $TMUX hint rather than declaring no multiplexer

  Scenario: mux doctor reports the detected mux and prints a pin hint
    Given a caller running behind a detected multiplexer
    When it runs cyberlegion mux doctor
    Then it reports harness, mux, pane, hub root, and self-id
    And it prints an export CYBER_MUX=<m> hint so the caller can pin the fast-path

  Scenario: unit spawn propagates the fast-path to the spawned child
    Given a caller spawning a new peer session behind a detected multiplexer
    When cyberlegion unit spawn opens the new session
    Then the launched command's environment carries CYBER_MUX so the child does not re-discover

  # ── mode reports the selected backend ──

  Scenario: mux mode reports the detected session backend
    Given a caller running inside a detected multiplexer
    When it runs cyberlegion mux mode
    Then it reports the selected session-backend name (tmux or herdr)

  Scenario: mux mode reports none when no backend is selectable
    Given a caller in no detectable multiplexer
    When it runs cyberlegion mux mode
    Then it reports "none" rather than erroring, and exits 0

  # ── Reporting whether a pane is currently focused (on screen for an attached client) ──

  Scenario: tmux reports a pane focused when an attached client is currently viewing it
    Given a tmux pane that is the active pane of the current window in a session with an attached client
    When the backend is asked whether that pane is focused
    Then it reports focused

  Scenario: tmux reports a pane not focused when no attached client is viewing it
    Given a tmux pane that is not the active pane, or whose window is not current, or whose session has no attached client
    When the backend is asked whether that pane is focused
    Then it reports not-focused

  Scenario: herdr reports a pane focused when its pane record is focused
    Given a herdr pane whose pane record reports it is currently being viewed by a client
    When the backend is asked whether that pane is focused
    Then it reports focused

  Scenario: herdr reports a pane not focused when its pane record is not focused
    Given a herdr pane whose pane record reports no client is currently viewing it
    When the backend is asked whether that pane is focused
    Then it reports not-focused

  Scenario: a focus query that cannot be answered is unknown, not a boolean
    Given a backend with no primitive to report focus, or a pane the backend can no longer resolve, or a focus query that errors
    When it is asked whether a pane is focused
    Then it answers unknown rather than a boolean, so callers fail open instead of treating the pane as absent