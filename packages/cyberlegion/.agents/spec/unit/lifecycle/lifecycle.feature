@frozen
Feature: unit lifecycle — warm peer session lifecycle over a multiplexer
  Spawn a new peer session — in a new git worktree it creates, or in an existing directory a caller
  supplies (--cwd) — and its session pane, then tear it back down cleanly — spawn and close are a
  deterministic inverse pair. Registry/discovery lives in unit/registry; backend selection and
  placement live in mux; sending/reading mail lives in mail; hook-based mail injection lives
  in mail/surface.

  # ── spawn resolves its launch before its own guards run ──
  # cli-input translates the CLI options into the spawn input — resolving an --agent/--agent-file
  # def into a harness and a composed launch command — BEFORE spawn's own guards, so a spawn that
  # can name no harness at all is refused ahead of a missing --task. Resolving the def itself is
  # agent/'s; this node owns only the seam where the realized command reaches unit spawn.

  Scenario: spawn with neither --harness nor a def-resolving --agent errors naming both routes
    Given a caller running unit spawn --task "seal the north greenhouse vents" with no --harness
    And no --agent or --agent-file on that command line
    When unit spawn runs
    Then it throws naming both --harness and --agent/--agent-file as the two ways to resolve one
    And no worktree is created
    And no session is opened
    And no unit is registered

  Scenario: a spawn with no --agent launches the harness's own default command, unadorned
    Given a caller running unit spawn --harness claude --task "seal the north greenhouse vents"
    And no --agent or --agent-file on that command line
    When unit spawn runs
    Then the launch command the spawn reports is the harness's own default binary
    And it carries no model flag and no appended-instructions flag

  Scenario: --agent resolves a def whose harness/model/instructions compose the launch
    Given an agent def named reviewer with harness claude and model sonnet
    When a caller runs unit spawn --agent reviewer --task t
    Then the spawned peer's harness is claude
    And the launch command carries that def's model and instructions

  Scenario: an explicit --harness overrides the resolved def's own harness
    Given an agent def with harness claude
    When a caller runs unit spawn --agent <name> --harness codex --task t
    Then the spawned peer's harness is codex

  # ── spawn registers the peer it opened ──
  # The title and section comment used to claim registration PRECEDED the launch. Nothing in the
  # child reads the record or the brief any more (the peer learns of its brief from the wake, rung
  # after spawn returns), so that ordering carries no contract and no Then ever asserted it. Retitled
  # under the Clearance this re-spec carries, rather than leaving a title the suite does not back.

  Scenario: spawn registers the peer it opened, active and attributed to its caller
    Given a caller spawning a new peer with --harness claude --task "reply to alice"
    When unit spawn runs
    Then the peer is registered with status active and spawnedBy the caller's id
    And its brief file and pane pointer are written

  Scenario: a spawn by a caller with no unit id of its own records no spawnedBy at all
    Given a caller that is itself no registered cyberlegion unit
    And that caller running unit spawn --harness claude --task "seal the north greenhouse vents"
    When unit spawn runs
    Then the peer is registered with status active
    And its record carries no spawnedBy field — neither an empty one nor a fabricated parent

  Scenario: --handle names the unit on its own record
    Given a caller running unit spawn --handle vinekeeper --harness claude --task t
    When unit spawn runs
    Then the peer's record carries the handle vinekeeper

  Scenario: a spawn with no --handle defaults the handle to the unit's 6-character short id
    Given a caller running unit spawn --harness claude --task t
    And no --handle on that command line
    When unit spawn runs
    Then the peer's record carries a handle equal to the first 6 characters of its id
    And the default worktree directory it created ends in that same 6-character slice

  # ── The brief is delivered by file, never typed ──

  Scenario: the resolved brief is written to the peer's brief file, not into the launch command
    Given a caller running unit spawn --task "do the thing"
    When unit spawn runs
    Then the peer's brief file contains "do the thing"
    And the typed launch command carries no brief text

  Scenario: --task - reads the brief from stdin
    Given a caller running unit spawn --harness claude --task -
    And the text "seal the north greenhouse vents" piped in on stdin
    When unit spawn runs
    Then the peer's brief file contains "seal the north greenhouse vents"

  Scenario: --brief-file reads the brief from the file it names
    Given a file holding the text "seal the north greenhouse vents"
    And a caller running unit spawn --harness claude --brief-file pointed at that file
    When unit spawn runs
    Then the peer's brief file contains "seal the north greenhouse vents"

  # ── An unmapped harness errors before anything launches ──
  # "Before anything launches" is an ORDERING promise, so each refusal below names the artifacts that
  # must not exist afterwards, not merely the throw. One artifact is deliberately NOT claimed: the
  # hub's own marker directory is created ahead of every guard, so "nothing at all is created" would
  # be false. Worktree, session and record are the three the refusals do guarantee.

  Scenario: an unmapped --harness errors without opening a worktree or session
    Given a caller running unit spawn --harness grok --task t
    When unit spawn runs
    Then it throws naming the launch map
    And no worktree is created
    And no session is opened
    And no unit is registered

  # ── No brief source errors ──

  Scenario: spawn with no --task, --task -, or --brief-file errors
    Given a caller running unit spawn --harness claude with no brief source at all
    When unit spawn runs
    Then it throws asking for a brief
    And no worktree is created
    And no session is opened
    And no unit is registered

  # ── Spawn resolves the default placement by mode: own visible space vs the caller's current space ──
  # The fleet-layer caller (Operator) is mux-agnostic — it expresses intent ("own isolated, visible
  # space"), never a mux placement. A new-worktree spawn is that intent, so it defaults to `workspace`
  # (mapped per-mux in mux/); a --cwd spawn opted into an existing space, so it defaults to a tab there.

  Scenario: a new-worktree spawn with no --at defaults to its own visible space (workspace), deterministically
    Given a caller running unit spawn with no --at (creating a new worktree)
    And that caller's own view currently focused on some other workspace
    When unit spawn runs
    Then the session opens at workspace — its own isolated, visible space
    And the placement does not name that currently-focused workspace

  Scenario: a --cwd spawn with no --at defaults to a tab in the caller's current space, not its own workspace
    Given a caller running unit spawn --cwd <an existing directory outside the primary checkout> with no --at
    When unit spawn runs
    Then the session opens at tab in the caller's current space

  Scenario: an explicit --at overrides the new-worktree default of workspace
    Given a caller running unit spawn --at tab (creating a new worktree)
    When unit spawn runs
    Then the session opens at tab, not the new-worktree default of workspace

  Scenario: an explicit --at overrides the --cwd default of tab
    Given a caller running unit spawn --cwd <an existing directory outside the primary checkout> --at workspace
    When unit spawn runs
    Then the session opens at workspace, not the --cwd default of tab

  # ── The new worktree is always distinct from the primary checkout ──
  # The load-bearing half of this refusal is WHEN it runs, not that it throws: the backstop asserts
  # that fire after creation already strand a worktree (and, on the atomic route, a pane) that
  # nothing rolls back. So the refusal is observed as the ABSENCE of the created artifacts.

  Scenario: spawn refuses a --worktree-path that resolves onto the primary checkout
    Given a caller running unit spawn with --worktree-path set to the primary checkout's own root
    When unit spawn runs
    Then it throws refusing to run a unit in the primary checkout
    And no session is opened
    And no worktree was added at that path
    And no unit is registered

  Scenario: a --worktree-path outside the primary checkout is accepted and the worktree created there
    Given a caller running unit spawn with --worktree-path set to a path outside the primary checkout
    When unit spawn runs
    Then the worktree is created at that path
    And the session opens with its cwd set to that path
    And the peer's record carries that worktree root

  Scenario: a spawn with no --worktree-path checks out beside the primary checkout, never inside it
    Given a caller running unit spawn with no --worktree-path (creating a new worktree)
    When unit spawn runs
    Then the worktree is created under a sibling directory of the primary checkout named <the primary's own directory name>.worktrees
    And its directory name is legion- followed by the unit's 6-character short id
    And that path is not nested inside the primary checkout

  Scenario: a spawn with no --branch creates the worktree on a branch named for the unit
    Given a caller running unit spawn with no --branch (creating a new worktree)
    When unit spawn runs
    Then the worktree is created on branch cyberlegion/unit- followed by the unit's id
    And the peer's record carries that branch

  Scenario: --branch names the branch the worktree is created on
    Given a caller running unit spawn --branch legion/greenhouse-vents (creating a new worktree)
    When unit spawn runs
    Then the worktree is created on branch legion/greenhouse-vents
    And the peer's record carries that branch

  # ── Which route creates the worktree: the backend's atomic call, or git worktree add then open ──
  # A compound guard — the atomic route runs only when the backend offers worktree creation AND the
  # placement is `workspace`. The same plain branch is therefore reached two ways, so both halves of
  # the guard need their own scenario or an implementation keyed on only one half passes.

  Scenario: a workspace spawn on a backend that can create worktrees takes the atomic route
    Given a caller running unit spawn --at workspace (creating a new worktree)
    And a selected session backend that offers worktree creation
    When unit spawn runs
    Then the backend is asked to create the worktree and open its workspace in a single call
    And no separate git worktree add is issued

  Scenario: a workspace spawn on a backend that cannot create worktrees takes the plain route
    Given a caller running unit spawn --at workspace (creating a new worktree)
    And a selected session backend that offers no worktree creation
    When unit spawn runs
    Then git worktree add creates the worktree
    And the session is opened by a separate backend call with its cwd set to that worktree

  Scenario: a tab placement takes the plain route even on a backend that can create worktrees
    Given a caller running unit spawn --at tab (creating a new worktree)
    And a selected session backend that offers worktree creation
    When unit spawn runs
    Then git worktree add creates the worktree
    And the session is opened by a separate backend call
    And the backend's atomic worktree-and-workspace call is not used

  Scenario: the created worktree carries its own tracked cyberlegion marker, whichever route created it
    Given a caller running unit spawn creating a new worktree
    When unit spawn runs
    Then a cyberlegion marker file exists under .agents/cyberlegion inside the new worktree
    And that marker is present whether the atomic route or the plain route created the worktree

  # ── A workspace placement is labeled so a human can find it by eye ──
  # A unit's own visible space is what the human scans to locate a session, so spawn resolves a
  # LABEL for it — `<code>-<subject>`, capped at 30 characters INCLUDING the code. The code is a
  # NieR YoRHa unit class picked from the brief's leading action: A2 for teardown, 9S for read-only
  # recon, else 2B. The three action sets are pairwise disjoint, so no brief can be in two of them —
  # the classes are what the suite pins, not the order the code happens to test them in. Only a
  # `workspace` placement is named; the handoff of a resolved name onto the backend is mux/'s.

  Scenario: a workspace spawn labels the space with a code and a subject drawn from the brief
    Given a caller running unit spawn --at workspace --task "add a retry budget to the mail poller"
    When unit spawn runs
    Then the space is opened under the label 2B-retry-budget-to-the-mail
    And the label is at most 30 characters including the code

  Scenario Outline: the brief's leading action selects the code from three disjoint action classes
    Given a caller running unit spawn --at workspace --task "<brief>"
    When unit spawn runs
    Then the space's label starts with <code>

    Examples:
      | brief                             | code |
      | remove the dead reconcile branch  | A2-  |
      | investigate the flaky mail wait   | 9S-  |
      | rename the pane index to locator  | 2B-  |

  Scenario: a matched leading action and article are dropped from the subject, never repeated in it
    Given a caller running unit spawn --at workspace --task "audit the governance provenance check"
    When unit spawn runs
    Then the space is opened under the label 9S-governance-provenance-check
    And the subject repeats neither the matched action word nor the article it led with

  Scenario: a leading word that matches no action is kept — only a recognized action is dropped
    Given a caller running unit spawn --at workspace --task "governance provenance check"
    When unit spawn runs
    Then the space is opened under the label 2B-governance-provenance-check
    And the subject still leads with its own first noun

  Scenario: the subject is drawn from the brief's first line that has content
    Given a caller running unit spawn --at workspace
    And a brief whose first two lines are blank and whose third line reads "prune the orchard netting"
    When unit spawn runs
    Then the space is opened under the label A2-orchard-netting

  Scenario: a brief too long for the cap is cut at a word boundary, not mid-word
    Given a caller running unit spawn --at workspace --task "refactor the session adapter placement resolution"
    When unit spawn runs
    Then the space is opened under the label 2B-session-adapter-placement
    And the label ends on a whole word rather than a partial one

  Scenario: a single first word wider than the whole budget is truncated rather than dropped
    Given a caller running unit spawn --at workspace --task "supercalifragilisticexpialidocious vents"
    When unit spawn runs
    Then the space is opened under the label 2B-supercalifragilisticexpiali
    And the label is 30 characters — the one case a subject legitimately ends mid-word

  Scenario: --handle supplies the subject in place of the brief-derived one, and the code still comes from the brief
    Given a caller running unit spawn --at workspace --handle scribe --task "diagnose the boot race"
    When unit spawn runs
    Then the space is opened under the label 9S-scribe

  Scenario: a brief with no usable subject falls back to the unit's own short id
    Given a caller running unit spawn --at workspace --task "!!! ???"
    When unit spawn runs
    Then the space is opened under a label whose subject is the unit's 6-character short id
    And the label still carries a code

  Scenario: no label is derived at all for a pane or tab placement
    Given a caller running unit spawn --at tab --task "add a retry budget to the mail poller"
    When unit spawn runs
    Then no label is derived — a pane or tab opens into a space the caller is already in

  # ── Spawn into an existing dir without a worktree (--cwd) ──

  Scenario: --cwd spawns a session into an existing directory and creates no worktree
    Given a caller running unit spawn --cwd <an existing directory outside the primary checkout> --harness claude --task t
    When unit spawn runs
    Then no worktree is created
    And the session opens in that directory
    And the peer is registered with that directory as its cwd and no created worktree

  Scenario: --cwd requires the directory to already exist
    Given a caller running unit spawn --cwd pointed at a path that does not exist
    When unit spawn runs
    Then it throws that the --cwd directory must already exist
    And no worktree is created
    And no session is opened
    And no unit is registered

  Scenario: --cwd refuses the primary checkout, the same as a created worktree
    Given a caller running unit spawn --cwd set to the primary checkout's own root
    When unit spawn runs
    Then it throws refusing to run a unit in the primary checkout
    And no worktree is created
    And no session is opened
    And no unit is registered

  Scenario: --cwd is mutually exclusive with the worktree-creating flags
    Given a caller running unit spawn --cwd <dir> together with --worktree-path or --branch
    When unit spawn runs
    Then it throws that --cwd cannot combine with worktree-creating flags
    And no worktree is created
    And no session is opened
    And no unit is registered

  # ── spawn delivers the peer's first turn (a fresh paned session boots idle) ──
  # For a paned agent, payload-delivery (the brief file) and turn-delivery (a taken turn) are two
  # acts. The brief stays on disk and no hook injects it; the model also takes no turn on its own —
  # it boots to an idle prompt until something rings it. So spawn rings a best-effort first-turn
  # doorbell over the same boot-race nudge submit-verify path, and that ring carries the instruction
  # to read the brief at its path and begin — pointing at the file, never re-typing its body.
  # Best-effort like mail/doorbell's delivery ring: the ring has THREE ways to fail — the pane is
  # gone, the turn is never taken within the cap, or no session backend can be resolved at all — and
  # every one of them is a warning, never a failed spawn.

  Scenario: spawn delivers a first turn to the freshly-opened pane so the peer acts on its brief
    Given a caller running unit spawn --harness claude --task "do the thing"
    When unit spawn runs
    Then the peer's brief is written to its brief file, not typed into the pane
    And after the session opens, the peer's pane is rung with a first-turn doorbell
    And the first-turn doorbell instructs the peer to read the brief at its file path and begin
    And it names that path rather than carrying the brief's body

  Scenario: the first turn is delivered as a taken turn, robust to the harness boot race
    Given a caller running unit spawn whose freshly-launched harness is still booting so the first submit stages the doorbell unsent
    When unit spawn runs
    Then the first-turn ring re-submits the staged doorbell until the peer takes the turn
    And the doorbell is delivered exactly once, never re-typed per retry

  Scenario: a first-turn ring that never completes never fails the spawn
    Given a caller running unit spawn whose pane keeps the first-turn doorbell staged past the retry cap
    When unit spawn runs
    Then the peer is still registered and its worktree and session are still created
    And the spawn succeeds
    And the un-taken first turn is reported as a best-effort warning, not a spawn error

  Scenario: a first-turn ring against a pane the backend reports as gone never fails the spawn
    Given a caller running unit spawn whose freshly-opened pane the session backend reports as no longer existing
    When unit spawn runs
    Then the peer is still registered and its worktree and session are still created
    And the spawn succeeds
    And the gone pane is reported as a best-effort warning, not a spawn error

  Scenario: a first-turn ring with no session backend left to resolve never fails the spawn
    Given a caller running unit spawn whose environment no longer names a session backend by the time the ring runs
    When unit spawn runs
    Then the peer is still registered and its worktree and session are still created
    And the spawn succeeds
    And the unresolvable backend is reported as a best-effort warning, not a spawn error

  Scenario: --no-wake spawns without delivering the first turn
    Given a caller running unit spawn --harness claude --task t --no-wake
    When unit spawn runs
    Then the peer is registered and its session opens with the brief written to its brief file
    And no first-turn doorbell is delivered to any pane

  # ── close tears down the worktree + session and reaps the state (spawn's inverse) ──

  Scenario: close removes the worktree, tears down the session, and reaps the registry record
    Given a registered unit with a worktree and a live session pane
    When a caller runs unit close <id>
    Then the worktree is removed
    And the session pane is torn down
    And the unit's registry record, pane pointer, and stored data are gone

  # ── close on a --cwd unit tears down the session but touches no worktree ──

  Scenario: close on a unit spawned with --cwd removes no worktree
    Given a registered unit spawned with --cwd (a recorded cwd and no created worktree)
    When a caller runs unit close <id>
    Then no worktree removal is attempted
    And the directory the caller supplied still exists on disk
    And the session pane is torn down
    And the unit's registry record, pane pointer, and stored data are gone

  # ── Refuses the primary checkout even with --force ──

  Scenario: close refuses a unit whose worktree is the primary checkout
    Given a registered unit with a live session pane whose worktree root equals the primary checkout
    When a caller runs unit close <id>
    Then it throws refusing the primary checkout
    And the unit's record still exists
    And no worktree removal is attempted
    And its session pane is not torn down

  Scenario: --force does not override the primary-checkout refusal
    Given a registered unit with a live session pane whose worktree root equals the primary checkout
    When a caller runs unit close <id> --force
    Then it still throws refusing the primary checkout
    And the unit's record still exists
    And no worktree removal is attempted
    And its session pane is not torn down

  # ── Refuses a dirty worktree unless --force ──

  Scenario: close refuses a unit with uncommitted changes in its worktree
    Given a registered unit with a live session pane, a pane pointer and a stored brief, whose worktree has uncommitted changes
    When a caller runs unit close <id>
    Then it throws about uncommitted changes
    And its worktree and its uncommitted changes are still on disk
    And the unit's record still exists
    And its pane pointer and stored brief still exist, so the close is retryable

  Scenario: --force discards uncommitted changes and completes the close
    Given a registered unit whose worktree has uncommitted changes
    When a caller runs unit close <id> --force
    Then the worktree is removed
    And the unit's record is gone

  # ── Completes the reap when the worktree/pane is already gone ──

  Scenario: close completes the reap when the worktree no longer exists on disk
    Given a registered unit whose worktree root no longer exists on disk
    When a caller runs unit close <id>
    Then no worktree removal is attempted
    And the unit's record and stored data are gone

  Scenario: close completes the reap when the session pane no longer exists
    Given a registered unit whose session pane the backend can no longer find
    When a caller runs unit close <id>
    Then the unit's record and stored data are gone regardless

  Scenario: close reaps a unit no pane can be resolved for, tearing nothing down
    Given a registered unit whose record carries no pane locator
    And a pane index holding an entry for a different unit
    When a caller runs unit close <id>
    Then no session pane teardown is attempted
    And that other unit's pane index entry is unchanged
    And the unit's record and stored data are gone
    And the result names no pane

  # ── A genuine teardown failure aborts before any reap ──
  # The contract is the ORDERING, not the throw: the abort happens before the pane teardown, so a
  # retry still has a pane to tear down. An implementation that tears the pane down and only then
  # throws would satisfy an error-only assertion while destroying exactly what the retry needs.

  Scenario: a genuine worktree-removal failure aborts the close and leaves the record intact
    Given a registered unit with a live session pane whose worktree removal genuinely fails
    When a caller runs unit close <id>
    Then it throws that removal failed
    And the unit's record and stored data are left intact for a retry
    And its session pane is not torn down

  # ── An unresolvable id errors ──

  Scenario: closing an unresolvable id errors
    Given no unit addressable under a given id
    And one other registered unit with its own record, pane pointer and stored data
    When a caller runs unit close <id>
    Then it throws that no unit is addressable under that id
    And no unit's record or stored data is removed

  # ── Reaps only the targeted unit ──

  Scenario: close leaves another unit's state untouched
    Given two registered units, a and b, each with their own worktree/pane/data
    When a caller runs unit close a
    Then unit a's state is gone
    And unit b's registry record, pane pointer, and stored data are unchanged

  # ── focus, nudge, read ──

  Scenario: focus moves input focus to a peer's session
    Given a registered peer with a live session pane
    When a caller runs unit focus <ref>
    Then the session adapter focuses that peer's pane

  # ── A pane comes from the record's own locator, else from the pane index ──
  # Two resolution routes reach one live target. The index route is the herdr route — a herdr peer
  # stores its pane only there. FOLLOW-UP, not blessed here: the index route returns a filename stem
  # with every character outside [A-Za-z0-9_-] replaced by "_", so a tmux pane "%3" comes back as
  # "_3" and addresses nothing. This scenario is written on the herdr route the code intends; the
  # tmux round-trip is filed as an implementation defect, not specified as correct.

  Scenario: a peer whose record carries no pane locator is reached through the pane index
    Given a registered herdr peer whose record carries no pane locator
    And a pane index entry mapping that unit's id to its live pane
    When a caller runs unit focus <ref>
    Then the session adapter focuses the pane the index named

  # ── focus beams the attached view all the way to the peer, across workspace and tab ──

  Scenario: focus beams the attached client across workspace and tab to a peer's pane
    Given a registered peer whose live pane sits in a different workspace and tab than the attached view
    When a caller runs unit focus <ref>
    Then the session adapter resolves that pane's own workspace and tab from the backend
    And it switches the attached client's active workspace to that pane's workspace
    And then switches its active tab to that pane's tab
    And then lands input focus on that pane
    And the attached view ends on the peer's pane rather than no-opping in the caller's current workspace

  Scenario: nudge delivers a default check-mail doorbell message to a peer's session
    Given a registered peer with a live session pane
    When a caller runs unit nudge <ref>
    Then the session adapter delivers the default check-mail message as a turn to that peer's pane

  Scenario: nudge carries a caller-supplied message with --message
    Given a registered peer with a live session pane
    When a caller runs unit nudge <ref> --message "<text>"
    Then the session adapter delivers that message as a turn to the peer's pane

  Scenario: an empty --message falls back to the default check-mail doorbell
    Given a registered peer with a live session pane
    When a caller runs unit nudge <ref> --message ""
    Then the session adapter delivers the default check-mail message as a turn to that peer's pane

  # ── nudge is robust to the harness boot race: a successful nudge means the turn was taken ──

  Scenario: nudge confirms the turn was taken and reports success without re-submitting
    Given a registered peer whose pane takes the first submit immediately
    When a caller runs unit nudge <ref>
    Then nudge reads the pane back, confirms the nudge text is no longer staged, and reports success
    And it issues no re-submit

  Scenario: nudge re-submits when the harness boot swallows the first submit
    Given a registered peer whose harness is still booting so the first submit stages the nudge text unsent
    When a caller runs unit nudge <ref>
    Then nudge re-submits the staged input until the peer takes the turn
    And it reports success only once the nudge text is no longer staged

  Scenario: a boot-race re-submit does not duplicate the message
    Given a registered peer whose first submit staged the nudge text unsent
    When a caller runs unit nudge <ref>
    Then nudge flushes the already-staged buffer rather than re-typing to complete the turn, so the peer's turn carries the message once

  Scenario: nudge fails loud when the turn is never taken within the bounded retry cap
    Given a registered peer whose pane keeps the nudge text staged unsent past the retry cap
    When a caller runs unit nudge <ref>
    Then it throws that the peer never took the turn
    And it does not report success

  Scenario: nudge on a pane the backend no longer knows fails naming the gone pane
    Given a registered peer whose recorded pane no longer exists in the session backend
    When a caller runs unit nudge <ref>
    Then it throws that the pane no longer exists
    And the error is not the never-took-the-turn message the retry cap raises

  Scenario: read scrapes a peer's session screen, bounded by --lines
    Given a registered peer with a live session pane holding some output
    When a caller runs unit read <ref> --lines 20
    Then the capture asked of the session adapter is bounded to 20 lines
    And the captured trailing output from that pane is printed

  Scenario: read with no --lines takes the backend's own default capture
    Given a registered peer with a live session pane holding some output
    When a caller runs unit read <ref> with no --lines
    Then the capture asked of the session adapter carries no line bound
    And the captured trailing output from that pane is printed

  Scenario: read --format json wraps the scrape in an envelope naming the ref and the pane
    Given a registered peer with a live session pane holding the text "vents sealed"
    When a caller runs unit read <ref> --format json
    Then the printed output is a JSON envelope carrying the ref, the pane, and the scraped output

  Scenario: read in the default format prints the raw scrape alone
    Given a registered peer with a live session pane holding the text "vents sealed"
    When a caller runs unit read <ref> with no --format
    Then the printed output is the scraped output itself, with no envelope around it

  # ── focus, nudge, read: error cases (unresolvable ref, no live pane) ──

  Scenario: focus on an unresolvable ref errors and focuses nothing
    Given no unit addressable under a given ref
    When a caller runs unit focus <ref>
    Then it throws that no unit is addressable under that ref
    And no pane is focused

  Scenario: focus on a unit with no known session pane errors and focuses nothing
    Given a registered unit with no known session pane
    When a caller runs unit focus <ref>
    Then it throws that the unit has no known session pane
    And no pane is focused

  Scenario: focus surfaces an error instead of a false success when the recorded pane no longer resolves in the backend
    Given a registered peer whose recorded pane no longer resolves to a live pane in the session backend
    When a caller runs unit focus <ref>
    Then it throws that the peer's pane could not be resolved to beam to
    And it does not report a successful focus
    And no workspace, tab, or pane is switched

  Scenario: nudge on an unresolvable ref errors and delivers nothing
    Given no unit addressable under a given ref
    When a caller runs unit nudge <ref>
    Then it throws that no unit is addressable under that ref
    And nothing is delivered to any pane

  Scenario: nudge on a unit with no known session pane errors and delivers nothing
    Given a registered unit with no known session pane
    When a caller runs unit nudge <ref>
    Then it throws that the unit has no known session pane
    And nothing is delivered to any pane

  Scenario: read on an unresolvable ref errors and scrapes nothing
    Given no unit addressable under a given ref
    When a caller runs unit read <ref>
    Then it throws that no unit is addressable under that ref
    And no pane output is captured

  Scenario: read on a unit with no known session pane errors and scrapes nothing
    Given a registered unit with no known session pane
    When a caller runs unit read <ref>
    Then it throws that the unit has no known session pane
    And no pane output is captured

  # ── clear resets a warm peer's context while keeping its pane/process warm ──
  # `submit`, never `sendText`: sendText types the characters and presses no Enter, leaving the
  # reset staged in the input box where it never runs. A one-shot reset has to actually execute, so
  # every clear scenario below separates "typed and entered" from "typed".

  Scenario: clear injects the harness's own in-session reset into a warm peer and tears nothing down
    Given a registered peer with harness claude, a live session pane, and its own worktree still on disk
    When a caller runs unit clear <ref>
    Then the session adapter types "/clear" into that peer's pane and then presses Enter
    And the reset command is not left staged unsent in the pane's input box
    And no session pane is torn down
    And no worktree is removed
    And the unit's registry record, pane pointer, and worktree are unchanged

  Scenario Outline: clear resolves each harness's own fresh-context command from a per-harness map
    Given a registered peer with harness <harness> and a live session pane
    When a caller runs unit clear on that peer
    Then the session adapter types "<command>" into that peer's pane and then presses Enter

    Examples:
      | harness | command   |
      | claude  | /clear    |
      | codex   | /clear    |
      | cursor  | /new-chat |

  # ── A harness with no honest fresh-context command fails loud ──

  Scenario: clear fails loud on a harness whose reset would not truly empty the context
    Given a registered peer with harness gemini and a live session pane
    When a caller runs unit clear <ref>
    Then it throws naming the harness and its missing reset mapping
    And nothing is sent to any pane

  Scenario: clear errors on an unmapped harness rather than guessing a command
    Given a registered peer with harness grok and a live session pane
    When a caller runs unit clear <ref>
    Then it throws naming the reset map
    And nothing is sent to any pane

  Scenario: clear on a record with an empty harness field fails loud before any command is resolved
    Given a registered peer with a live session pane whose record carries an empty harness field
    When a caller runs unit clear <ref>
    Then it throws that the unit has no harness on record
    And nothing is sent to any pane

  # ── clear needs a live target, like nudge and focus ──

  Scenario: clear on an unresolvable ref errors and sends nothing
    Given no unit addressable under a given ref
    When a caller runs unit clear <ref>
    Then it throws that no unit is addressable under that ref
    And nothing is sent to any pane

  Scenario: clear on a unit with no known session pane errors and sends nothing
    Given a registered unit with no known session pane
    When a caller runs unit clear <ref>
    Then it throws that the unit has no known session pane
    And nothing is sent to any pane
