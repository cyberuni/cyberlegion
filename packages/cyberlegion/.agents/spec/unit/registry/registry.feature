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

  # ── Register records which repository a worktree belongs to ──
  # A session in a linked worktree runs in a folder named after the worktree, not the repository.
  # The record carries the primary checkout so a lookup by repository finds it, as spawn's does.

  Scenario: register in a linked worktree records the primary checkout and the branch
    Given an unregistered session whose cwd is a linked worktree of a repository, on branch "fix/login"
    When it runs unit register --harness claude
    Then the record's worktree root is the linked worktree
    And the record's worktree primary root is the repository's primary checkout
    And the record's worktree branch is "fix/login"

  Scenario: register in a primary checkout records that checkout as its own primary root
    Given an unregistered session whose cwd is a repository's primary checkout
    When it runs unit register --harness claude
    Then the record's worktree root and worktree primary root are both that checkout

  Scenario: re-register fills in a primary root an older record lacks
    Given a session already registered in the current pane, in a linked worktree, whose record's worktree carries no primary root
    When it runs unit register --harness claude again
    Then the record's worktree primary root is the repository's primary checkout
    And it keeps the same id

  # ── Register never takes ownership of another unit's worktree ──
  # A session can sit in a worktree another unit owns. Recording it as its own `worktree` would let
  # its close remove that worktree or release the owner's lease, so it is recorded as shared instead.

  Scenario: register in a worktree another unit owns records it as shared, not as its own
    Given a registered unit whose record owns a linked worktree
    And an unregistered session whose cwd is that linked worktree
    When it runs unit register --harness claude
    Then the session's record has no worktree of its own
    And the session's record carries that worktree's root, branch, and primary root as its shared worktree
    And the shared worktree names the owning unit's id as its owner
    And the owning unit's record is unchanged

  Scenario: re-register of a unit holding a shared worktree keeps it shared, never owned
    Given a session registered in the current pane whose record has no worktree of its own and shares a linked worktree
    And no other unit's record owns that worktree any more
    When it runs unit register --harness claude again
    Then the record still has no worktree of its own
    And the record's shared worktree is that linked worktree, naming no owner
    And it keeps the same id

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

  Scenario: whoami errors when the session's self id has no agent record
    Given a session whose self id resolves but has no agent record in the registry
    When it runs unit whoami
    Then the command errors that the registered self id has no agent record

  # ── who lists the addressable peers ──
  # `unit who` (alias: top-level `who`) is the single list command — the old `session list` folded
  # in here (CR-2 resolution #1): fields id·handle·harness·status·pane·shared, aggregate "N units",
  # default non-exited + --all.

  Scenario: who lists every non-exited unit with a definitive aggregate line
    Given two registered units, alice and bob
    When a session runs unit who
    Then it lists both as a TOON list with fields id, handle, harness, status, pane, and shared
    And the aggregate line reads "2 units"

  Scenario: who shows the worktree a unit shares, and "-" for a unit that shares none
    Given a registered unit whose record carries a shared worktree and one whose record carries none
    When a session runs unit who
    Then the first unit's shared field is its shared worktree's root
    And the second unit's shared field is "-"
    When it runs unit who --format json
    Then the first unit's entry carries its shared worktree with its root, branch, and owner
    And the second unit's entry carries no shared worktree

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
    And the agent's worktree is on disk
    When a session runs unit prune
    Then that agent's status becomes exited
    And it is included in the pruned list

  Scenario: prune marks an agent exited when its herdr pane is gone
    Given a registered agent whose record locates a herdr pane that no longer exists
    And the agent's worktree is on disk
    When a session runs unit prune
    Then that agent's status becomes exited
    And it is included in the pruned list

  Scenario: prune leaves a live herdr-pane agent untouched
    Given a registered agent whose record locates a live herdr pane and a fresh lastSeen
    When a session runs unit prune
    Then that agent's status remains unchanged
    And the pruned list is empty

  Scenario: prune marks a pane-less agent exited when its last-seen is stale
    Given a registered agent with no pane whose lastSeen is older than the staleness window
    And the agent's worktree is on disk
    When a session runs unit prune
    Then that agent's status becomes exited

  Scenario: prune leaves an agent whose pane is live untouched however stale its last-seen
    Given a registered agent whose tmux pane is live and whose lastSeen is older than the staleness window
    When a session runs unit prune
    Then that agent's status remains unchanged
    And the pruned list is empty

  Scenario: prune leaves a pane-bound agent untouched when its multiplexer cannot be queried
    Given a registered agent whose tmux pane cannot be probed because tmux answers no pane list
    And the agent's lastSeen is older than the staleness window
    When a session runs unit prune
    Then that agent's status remains unchanged
    And the pruned list is empty

  Scenario: prune leaves a live, recently-seen agent untouched
    Given a registered agent with a live pane and a fresh lastSeen
    When a session runs unit prune
    Then that agent's status remains unchanged
    And the pruned list is empty

  Scenario: prune leaves a stopped unit untouched however stale its last-seen
    Given a registered unit with status stopped and no pane
    And the unit's lastSeen is older than the staleness window
    When a session runs unit prune
    Then that unit's status remains stopped
    And the pruned list is empty

  # ── prune deletes exited units with nothing left on disk ──

  Scenario: prune deletes an exited unit that never had a worktree, with its brief and mailbox
    Given a registered unit with status exited and no worktree
    And the unit has a stored brief and a mailbox holding one message
    When a session runs unit prune
    Then the hub holds no record for that unit
    And the hub holds no brief and no mailbox for that unit
    And the pruned list includes that unit as deleted

  Scenario: prune deletes an exited unit whose worktree is gone from disk
    Given a registered unit with status exited whose recorded worktree no longer exists on disk
    When a session runs unit prune
    Then the hub holds no record for that unit
    And the pruned list includes that unit as deleted

  Scenario: prune keeps an exited unit whose worktree is still on disk
    Given a registered unit with status exited whose recorded worktree exists on disk
    And the unit has a mailbox holding one message
    When a session runs unit prune
    Then that unit's status remains exited
    And its mailbox still exists
    And the pruned list is empty

  Scenario: prune deletes an exited unit on its repository's primary checkout without touching the checkout
    Given a registered unit with status exited whose recorded worktree is its repository's primary checkout, which exists on disk
    When a session runs unit prune
    Then the hub holds no record for that unit
    And the primary checkout still exists on disk
    And the pruned list includes that unit as deleted

  Scenario: prune keeps an exited unit whose linked worktree is still on disk
    Given a registered unit with status exited whose recorded worktree exists on disk and differs from its recorded primary checkout
    When a session runs unit prune
    Then that unit's status remains exited
    And the pruned list is empty

  Scenario: prune deletes a unit it marks exited when the unit has no worktree
    Given a registered agent with no pane and no worktree whose lastSeen is older than the staleness window
    When a session runs unit prune
    Then the hub holds no record for that agent
    And the pruned list includes that agent as deleted

  Scenario: prune leaves the pane pointer of a deleted unit when another unit now holds that pane
    Given a registered unit with status exited and no worktree whose record locates herdr pane w1:p1
    And the pane pointer for w1:p1 names a different unit
    When a session runs unit prune
    Then the pane pointer for w1:p1 still names the different unit

  Scenario: prune drops a deleted unit's own pane pointer
    Given a registered unit with status exited and no worktree whose record locates herdr pane w1:p1
    And the pane pointer for w1:p1 names that unit
    When a session runs unit prune
    Then no pane pointer for w1:p1 exists

  Scenario: prune clears git's registration of a deleted unit's gone worktree in the recorded repository
    Given a registered unit with status exited whose recorded worktree is gone from disk
    And the record names the worktree's primary checkout, which exists on disk
    When a session runs unit prune
    Then git worktree prune runs in that primary checkout

  Scenario: prune never deletes a stopped unit with no worktree
    Given a registered unit with status stopped and no worktree
    When a session runs unit prune
    Then that unit's status remains stopped
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

  Scenario: a herdr pane whose $HERDR_PANE_ID went stale resolves the pane herdr reports, not the unit holding the stale id
    Given unit A's pane pointer is keyed by herdr pane wH:p1 and unit B's by herdr pane w13:p1
    And the calling session's $HERDR_PANE_ID is w13:p1 while herdr reports the calling pane as wH:p1
    When it resolves its own identity
    Then it resolves to unit A's id

  Scenario: a herdr pane herdr cannot report resolves self-id from $HERDR_PANE_ID
    Given an agent registered in a herdr pane addressed by $HERDR_PANE_ID
    And herdr gives no answer for the calling pane
    When it resolves its own identity
    Then it resolves that agent's id via the pane pointer for $HERDR_PANE_ID

  Scenario Outline: a herdr that cannot be trusted to report the calling pane keeps $HERDR_PANE_ID
    Given unit A's pane pointer is keyed by herdr pane wH:p1 and unit B's by herdr pane w13:p1
    And the calling session's $HERDR_PANE_ID is w13:p1 while herdr reports the calling pane as wH:p1
    And herdr --version reads <version>
    When it resolves its own identity
    Then it resolves to unit B's id

    Examples:
      | version             |
      | herdr 0.8.1         |
      | an unreadable value |

  Scenario: register in a herdr pane whose $HERDR_PANE_ID went stale keys the pane herdr reports
    Given unit B's pane pointer is keyed by herdr pane w13:p1
    And the calling session's $HERDR_PANE_ID is w13:p1 while herdr reports the calling pane as wH:p1
    When the session runs unit register
    Then a new record keyed by wH:p1 is written and unit B keeps the w13:p1 pointer

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

  # ── A moved herdr pane keeps its unit (#272) ──

  Scenario: register in a herdr pane records the pane terminal id
    Given an unregistered session inside a herdr pane whose terminal id herdr reports
    When it runs unit register --handle mover --harness claude
    Then the record's herdr pane locator carries that terminal id

  Scenario: prune keeps a unit whose herdr pane moved and follows it to the new pane id
    Given a registered agent whose herdr pane locator carries a terminal id
    And herdr now lists that terminal under a different pane id
    When a session outside herdr runs unit prune
    Then that agent's status remains active
    And the pruned list is empty
    And the record's pane id is the new pane id
    And the new pane id resolves to that agent's id
    And the old pane id resolves to no agent

  Scenario: reconcile keeps a unit whose herdr pane moved and follows it to the new pane id
    Given a registered agent whose herdr pane locator carries a terminal id
    And herdr now lists that terminal under a different pane id
    When reconcile runs from within a herdr session
    Then that agent is not in the changes
    And that agent's status remains active
    And the record's pane id is the new pane id

  Scenario: prune marks a unit exited when its herdr pane id now names another terminal
    Given a registered agent whose herdr pane locator carries a terminal id
    And the agent's worktree is on disk
    And herdr lists the agent's pane id under another terminal and does not list the agent's terminal
    When a session runs unit prune
    Then that agent's status becomes exited
    And it is included in the pruned list

  Scenario: prune keeps a moved unit whose terminal herdr cannot list
    Given a registered agent whose herdr pane locator carries a terminal id
    And herdr answers no pane list
    When a session runs unit prune
    Then that agent's status remains active
    And the pruned list is empty

  Scenario: touch in a moved herdr pane refreshes the unit pane to the one herdr reports
    Given a registered agent whose herdr pane moved, its shell still holding the old $HERDR_PANE_ID
    And herdr 0.9.5 reports the calling pane's new id and its terminal id
    When the caller runs a command that resolves its own identity
    Then that agent's lastSeen is refreshed to now
    And the record's herdr pane locator is the new pane id with that terminal id
    And the new pane id resolves to that agent's id

  Scenario: resolveSelfId in a moved herdr pane finds the unit by its terminal
    Given a registered agent whose herdr pane moved, with no pane pointer for the new pane id
    And herdr 0.9.5 reports the calling pane's new id and the agent's terminal id
    When resolveSelfId runs
    Then it returns that agent's id

  Scenario: a herdr record with no terminal id is pruned by its pane id as before
    Given a registered agent whose herdr pane locator carries no terminal id
    And the agent's worktree is on disk
    And herdr lists the agent's terminal under a different pane id
    When a session runs unit prune
    Then that agent's status becomes exited
    And it is included in the pruned list

  Scenario: sessionLive reads a unit whose herdr pane moved as live
    Given a registered agent whose herdr pane locator carries a terminal id
    And herdr now lists that terminal under a different pane id
    When sessionLive judges the agent
    Then it answers live

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

  Scenario: a handle two live records share fails loud rather than taking the first
    Given two live session agents that share the handle homa and no standing identity homa
    When a recipient named homa is resolved
    Then it errors naming both agents' ids
    And each agent still resolves by its own id

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

  # ── A standing owner's home (where its presence is spawned on demand) ──

  Scenario: unit register --standing --home --agent records the owner's home and its agent definition
    Given an existing folder /work/keeper-desk that resolves the agent definition triage
    When a session in the folder /tmp/elsewhere runs unit register --standing --handle keeper --home /work/keeper-desk --agent triage
    Then keeper's standing record carries the home /work/keeper-desk with the agent definition triage
    And the record's cwd is /tmp/elsewhere, not the home

  Scenario: unit register --standing --home --harness records the owner's home and its harness
    Given an existing folder /work/keeper-desk
    When a session runs unit register --standing --handle keeper --home /work/keeper-desk --harness codex
    Then keeper's standing record carries the home /work/keeper-desk with the harness codex

  Scenario: re-registering a standing owner from another folder keeps its home and its presence
    Given a standing identity keeper whose home is /work/keeper-desk with the harness codex
    And keeper's presence is bound to a live unit
    When a session in the folder /tmp/elsewhere runs unit register --standing --handle keeper
    Then keeper's home is still /work/keeper-desk with the harness codex
    And keeper's presence is still bound to that unit

  Scenario: unit register --standing --clear-home drops the owner's home
    Given a standing identity keeper whose home is /work/keeper-desk with the harness codex
    When a session runs unit register --standing --handle keeper --clear-home
    Then keeper's standing record carries no home

  Scenario: --clear-home on a standing owner with no home is a no-op
    Given a standing identity keeper with no home
    When a session runs unit register --standing --handle keeper --clear-home
    Then it does not throw
    And keeper's standing record carries no home

  Scenario: a home folder that does not exist is refused and nothing is written
    Given an empty registry
    And no folder exists at /work/missing
    When a session runs unit register --standing --handle keeper --home /work/missing --harness codex
    Then it throws that the home must already exist
    And no standing record exists for keeper

  Scenario: a home with no launch is refused
    Given a standing identity keeper whose home is /work/keeper-desk with the harness codex
    And an existing folder /work/other-desk
    When a session runs unit register --standing --handle keeper --home /work/other-desk
    Then it throws that a home needs exactly one of --agent or --harness
    And keeper's home is still /work/keeper-desk with the harness codex

  Scenario: a home naming both an agent definition and a harness is refused
    Given a standing identity keeper whose home is /work/keeper-desk with the harness codex
    And an existing folder /work/other-desk that resolves the agent definition triage
    When a session runs unit register --standing --handle keeper --home /work/other-desk --agent triage --harness claude
    Then it throws that a home needs exactly one of --agent or --harness
    And keeper's home is still /work/keeper-desk with the harness codex

  Scenario: a home with an unrecognized harness is refused
    Given an empty registry
    And an existing folder /work/keeper-desk
    When a session runs unit register --standing --handle keeper --home /work/keeper-desk --harness grok
    Then it throws naming claude, cursor, and codex
    And no standing record exists for keeper

  Scenario: a home whose agent definition does not resolve from the folder is refused
    Given an empty registry
    And an existing folder /work/keeper-desk that resolves no agent definition named triage
    When a session runs unit register --standing --handle keeper --home /work/keeper-desk --agent triage
    Then it throws that the agent definition triage does not resolve from the home
    And no standing record exists for keeper

  Scenario: a home on the primary checkout of its repository is refused
    Given an empty registry
    And a git repository whose primary checkout is /work/repo
    When a session runs unit register --standing --handle keeper --home /work/repo --harness codex
    Then it throws that the home refuses the primary checkout
    And no standing record exists for keeper

  Scenario: a launch with no home is refused
    Given a standing identity keeper with no home
    When a session runs unit register --standing --handle keeper --harness codex
    Then it throws that a launch needs --home
    And keeper's standing record carries no home

  Scenario: --home together with --clear-home is refused
    Given a standing identity keeper whose home is /work/keeper-desk with the harness codex
    And an existing folder /work/other-desk
    When a session runs unit register --standing --handle keeper --home /work/other-desk --harness codex --clear-home
    Then it throws that --home and --clear-home contradict
    And keeper's home is still /work/keeper-desk with the harness codex

  Scenario: a home flag on a session registration is refused
    Given an unregistered session in a tmux pane
    And an existing folder /work/keeper-desk
    When the session runs unit register --home /work/keeper-desk --harness codex
    Then it throws that a home belongs only to a named standing owner
    And no agent record is written for the session

  Scenario: a home flag on the bare standing listing is refused
    Given a standing identity keeper with no home
    And an existing folder /work/keeper-desk
    When a session runs unit register --standing --home /work/keeper-desk --harness codex
    Then it throws that a home belongs only to a named standing owner
    And keeper's standing record carries no home

  # ── A standing owner's presence (the live unit standing in for it) ──

  Scenario: unit claim binds the caller's unit as a standing owner's presence
    Given a standing identity homa and a live session agent alice inside a multiplexer pane
    When alice runs unit claim homa
    Then homa's presence is bound to alice
    And unit claim homa --show reports alice

  Scenario: the last claim wins and exactly one unit is the presence
    Given a standing identity homa whose presence is bound to alice
    When a live session agent bob inside a multiplexer pane runs unit claim homa
    Then homa's presence is bound to bob
    And homa has exactly one bound presence

  Scenario: unit claim --clear unbinds the presence
    Given a standing identity homa whose presence is bound to alice
    When a session runs unit claim homa --clear
    Then homa has no bound presence
    And unit claim homa --show reports none

  Scenario: unit claim --clear is a no-op when no presence is bound
    Given a standing identity homa with no bound presence
    When a session runs unit claim homa --clear
    Then it does not throw
    And unit claim homa --show reports none

  Scenario: clearing a presence for a handle with no standing record throws
    Given a registry with no standing record for handle homa
    When a session runs unit claim homa --clear
    Then it throws that there is no standing owner homa

  Scenario: claiming a handle with no standing record throws instead of minting one
    Given a registry with no standing record for handle homa
    When a live session agent inside a multiplexer pane runs unit claim homa
    Then it throws that there is no standing owner homa
    And no standing record is created

  Scenario: a presence whose unit has exited reads as no presence bound
    Given a standing identity homa whose presence is bound to alice
    And alice's status is exited
    When homa's presence is resolved
    Then it reports no presence bound
    And it never resolves to alice

  Scenario: unit claim throws when the caller reports no multiplexer
    Given a standing identity homa and a caller whose multiplexer probe reports none
    When the caller runs unit claim homa
    Then it throws that claiming a presence needs a multiplexer to open panes
    And homa's presence is left unchanged

  Scenario: unit claim throws when the caller has no self id
    Given a standing identity homa whose presence is bound to alice
    And a caller inside a multiplexer pane that has no registered self id
    When the caller runs unit claim homa
    Then it throws that the caller must run unit register first
    And homa's presence is still bound to alice

  Scenario Outline: the claim tracks the multiplexer probe, never how the caller was realized
    Given a standing identity homa and a caller realized as <realization> whose multiplexer probe reports <probe>
    When the caller runs unit claim homa
    Then the claim <outcome>

    Examples:
      | realization    | probe          | outcome                                      |
      | a named subagent | a multiplexer  | binds the caller as homa's presence          |
      | a plain session  | a multiplexer  | binds the caller as homa's presence          |
      | a named subagent | none           | throws that it needs a multiplexer to open panes |
      | a plain session  | none           | throws that it needs a multiplexer to open panes |

  Scenario: binding a presence neither creates nor requires a bound main pane
    Given a standing identity homa and no main pane bound
    When a live session agent inside a multiplexer pane runs unit claim homa
    Then homa's presence is bound
    And no main pane is bound

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

  Scenario: reconcile culls nothing when the current multiplexer cannot be queried
    Given a session inside a tmux pane and a registered agent whose tmux pane is bound
    And tmux answers no pane list
    When it runs unit who --reconcile
    Then it returns no changes
    And that agent's status remains unchanged

  Scenario: prune reconcile-culls too
    Given a session inside a tmux pane and a registered agent whose tmux pane is not in the live tmux pane list
    And the agent's worktree is on disk
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

