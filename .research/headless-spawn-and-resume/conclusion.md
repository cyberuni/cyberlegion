# Conclusion — headless spawn and resume

> Other documents cite this file. The experiments and sources are in [evidence.md](./evidence.md),
> the question is in [topic.md](./topic.md), and the proposed work is in [changes.md](./changes.md).
> Versions tested: Claude Code 2.1.319, Codex CLI 0.159.3, Cursor agent 2026.09.28.

## The answers

| # | Question | Answer |
| --- | --- | --- |
| Q1 | Spawn a unit in print mode instead of a pane? | **Yes**, on all three harnesses. Each returns its conversation id in machine-readable output, and Claude (`--session-id`) and Cursor (`create-chat`) let the spawner know the id before the first turn. A print-mode run is **one turn per process**: the unit exists only between turns, as a conversation id. |
| Q2 | With no multiplexer, switch between units: attach, watch, take a turn? | **Partly.** Nothing harness-neutral exists. Claude Code ships a mux-free host (`--bg`, `claude agents`, `attach`, `logs`, `stop`). Codex has a shared daemon with `codex agents` and a durable per-thread `codex queue`. Cursor's `agent persist` is tmux underneath. cyberlegion can build a harness-neutral switch itself: stop the unit's turns, run the harness's interactive resume in the caller's own terminal, and hand back on exit. |
| Q3 | Resume a `-p` session interactively with the harness's own resume? | **Yes for Claude Code and Codex. Partly for Cursor**, which resumes only from the same workspace. History always carries over. Permission mode, tool allowlists, and sandbox flags do **not** carry over to a print-mode resume and must be passed on every turn. Hooks fire on resume in Claude, are trust-gated in Codex, and mostly don't fire in Cursor. Concurrent resumes **silently lose turns** on Claude and Cursor. Only Codex locks. |

### What carries over on resume

| Carried? | Claude Code | Codex | Cursor |
| --- | --- | --- | --- |
| History | yes, from any directory | yes, from any directory | **only from the same workspace.** From another one it silently opens an empty chat under the same id |
| cwd | the **launch** directory | `exec resume`: launch directory. Interactive: the thread's **last recorded** directory | the workspace it was launched in |
| Permission mode / sandbox | `-p --resume`: the settings default, not the spawn's mode. Interactive: the saved mode (documented, not distinguishable in this test) | flags are per-invocation | `--force` is per-invocation |
| Tool allowlist (`--allowedTools` and similar) | no | n/a | n/a |
| MCP, plugin-dir, settings, add-dir flags | no (documented) | not tested | not tested |
| Hooks | fire under `-p` and on resume (`source: "resume"`). Project hooks follow the **new** cwd | plugin hooks load under `exec`. Untrusted project hooks are skipped silently | `sessionStart` on a new chat only. `stop` and `beforeSubmitPrompt` don't fire under `-p` |
| Trust prompts on first interactive resume | workspace trust (`-p` skipped it) | hook trust, plus a shared-daemon settings conflict | none seen (`--trust` in `-p`) |

### What breaks under concurrency

| Case | Claude Code | Codex | Cursor |
| --- | --- | --- | --- |
| Two resumes of one id at once | both run. The transcript forks, the next resume follows the branch written last, and the other branch's turns are **lost silently** | the second fails fast: `already has an active writer (code -32600)` | both run. The long-lived process's next write wins, and the other process's turn is **lost silently** |
| A resume while a `-p` turn is mid-tool-call | the second turn sees the first's tool call as "interrupted". The first finishes, and one of the two turns is lost | the second fails fast | not tested separately. Expect the same as the row above |
| A resume of a `claude --bg` session | refused: exit 1, "That session is running in the background" | — | — |

**Consequence: cyberlegion must serialize turns on a unit itself.** Codex's lock is a backstop.
Claude's and Cursor's sessions have no lock, and a lost turn there is a lost order or a lost mail
reply that no one sees go missing.

## C1. A print-mode unit is a turn-driven unit, not a session

Every primitive cyberlegion has today assumes a process that persists between turns and a pane
that reaches it. A print-mode unit inverts that. Between turns there is **no process at all**,
only a conversation id, a cwd, and a launch recipe. `.research/agent-session-wake`'s core
constraint ("a model is not running between turns") becomes literally true of the process too.

That is the useful property. A turn-driven unit costs nothing while idle, survives reboots, needs no
multiplexer, and is woken by the one mechanism every harness supports: **re-invoke the harness
with `resume <id>` and a prompt**. In `agent-session-wake`'s table this is a new wake path:

| # | Path | Who waits | Turn delivered by | Idle cost | Interactive | Needs mux |
| --- | --- | --- | --- | --- | --- | --- |
| **F** | **Resume turn** | cyberlegion (the mail write itself) | a fresh `<harness> -p --resume <id> "<doorbell>"` process | 0 tokens, 0 processes | no, until attached | no |

Path F is event-driven (the `mail send` that writes the message also starts the turn) and portable
to all three harnesses. Its cost is per turn: a cold process start (the first Claude `-p` turn took
9.9 s end to end), and a context re-read that is uncached once the unit has been idle past the
prompt-cache TTL.

## C2. Design sketch

Each item is marked **load-bearing** (expensive to unwind once units exist on hubs) or **cheap**.

### C2.1 Placement: a `headless` unit — load-bearing

Spawn gets a placement alongside the multiplexer ones. A headless unit's record keeps the existing
fields and differs in three of them:

- `pane: null`, as today's type already permits.
- `conversation` is **set at spawn**, never left to a hook. Claude:
  `--session-id <uuid generated by spawn>`. Cursor: `agent create-chat`. Codex: read
  `thread.started.thread_id` from the first `exec --json` event.
- `launch` holds the **per-turn** recipe, with every flag that does not survive a resume:
  permission mode, tool allowlist, sandbox, model, `--force`. These are re-applied on every turn,
  because E1.3 showed they are not inherited.

The distinguishing field (a new `placement: 'headless'`, or `pane: null` together with a set
`conversation`) is the load-bearing choice. Every reader of `pane` (doorbell, `read`, `nudge`,
`clear`, `restart`, `who`, `prune`) has to treat it as its own case rather than as a broken pane.
An explicit field is recommended: `pane: null` already means "a registered session in no pane"
today, and overloading it would make a broken record look headless.

### C2.2 The turn runner and the per-unit turn lock — load-bearing

Something has to run each turn and to stop two from overlapping. Proposed: one internal command,
`cyberlegion unit turn <unit> [--prompt <text>]`, started **detached** by whoever wants a turn
(spawn, `mail send`, `unit nudge`). It:

1. takes an exclusive **turn lock** on the unit (the store already has `store/lock.ts`). If the
   lock is held, it records a "turn wanted" flag and exits. Turns are never stacked or dropped,
   only coalesced.
2. runs `<harness> -p --resume <conversation> <launch flags> "<prompt>"` in the unit's cwd, with
   stdin closed, streaming `stream-json` (Claude and Cursor) or `--json` (Codex) to a per-unit
   **turn log** under the hub.
3. on exit, records the exit status and `lastSeen`. If "turn wanted" is set, or the unit has
   unread mail, it runs again with the delivery doorbell. Otherwise it releases the lock.

The lock is what makes path F safe on Claude and Cursor, where E1.5 and E3.5 showed silent turn
loss. On Codex the harness's own writer lock (E2.5) is a second line. If Codex reports `active
writer`, it means something outside cyberlegion holds the thread, and the runner should treat it as
"turn wanted", not as a failure.

### C2.3 Mail and the doorbell — cheap

The mailbox stays the source of truth (`agent-session-wake`: doorbell versus mailbox). For a
headless recipient, `wakeRecipient` does not look for a pane. It starts a detached `unit turn`
with `DELIVERY_DOORBELL` as the prompt. The doorbell text stays minimal. The payload is never put
in the prompt, because a print-mode prompt is a **user turn** and so sits on the authority plane of
`agent-communication-mechanisms` C1. Putting mail content there would make peer mail
authoritative, which C2 of that dossier rules out.

`codex queue` (E2.6) is a native per-thread inbox delivered on the next turn. It is a tempting
transport for Codex, but it would give Codex units a second mailbox with its own unread state and
no sender, thread, or ack. Don't use it as the mailbox. If a Codex unit is ever left live in an
interactive client, `codex queue` could serve as that unit's doorbell. That case is untested.

### C2.4 Hooks — cheap

A headless unit relies on no hook. The brief path is in the first turn's prompt (ADR-0032's spawn
wake, unchanged), and the conversation id comes from the spawn (C2.1). This is the path #242
asks for, for the headless case. The SessionStart mail hook still fires on Claude `-p` and does no
harm. On Cursor it fires only on the first turn, and on Codex only once the project hooks are
trusted. Unread mail needs no hook, because the runner's drain step (C2.2 step 3) covers it.

### C2.5 Watch, attach, and take a turn without a multiplexer — cheap

This is the answer to Q2 that cyberlegion can own across harnesses:

- **See what it is doing:** `unit read <unit>` tails the turn log (C2.2 step 2). The log is
  cyberlegion's own file in a format cyberlegion parses. Reading harness transcripts directly is
  avoided: Claude's JSONL is documented as internal, Codex's rollout format is undocumented, and
  Cursor's is an undocumented SQLite file.
- **Give it a one-off turn:** `unit nudge <unit> "<text>"` starts a `unit turn` with that prompt.
- **Attach:** `unit attach <unit>` takes the turn lock, waiting for a running turn to finish, then
  `exec`s `<harness> --resume <conversation>` (Cursor: `agent --resume`) in the unit's cwd, in the
  **caller's** terminal. Mail arriving while the human is attached sets "turn wanted". On exit,
  attach releases the lock and runs the drain. Switching to another unit is just attaching to it.
  The user's terminal is the only one needed, one unit at a time.

Attach must handle what E1.4 and E2.4 found. Claude asks for workspace trust the first time a
human opens a worktree that only `-p` has seen, and Codex asks for hook trust and may report a
shared-daemon settings conflict. These prompts are the human's to answer, so attach passes them
through and does not answer them.

Claude's `--bg` host (E1.6) is the better experience on Claude alone: real attach and detach,
`claude agents` listing, and a session that stays warm. It is not recommended as the base. It is
Claude-only. It cannot receive a turn without an attached terminal, and `--bg --resume` on a
running session silently starts a copy under a new id. It refuses `-p --resume` while running, so
it cannot be mixed with path F. If it is wanted later, it fits as a second, Claude-only headless
mode: `claude stop` before a resume turn, `claude --bg --resume` after.

### C2.6 Close, prune, presence — cheap

- **`unit close`:** takes the turn lock (waiting for or killing a running turn, whichever the
  close mode says), then releases the worktree lease as today. It keeps the conversation, because
  the harness owns it.
- **`prune`:** a headless unit is not stale because its `lastSeen` is old. Idle is its normal
  state. It is live while its record exists. A running turn is detected by the runner's pid
  (`store/process-liveness.ts`). This is the pane-less exception `harness-hooks` follow-up 4
  already anticipated ("keep the 15-min timer for pane-less records only"). That follow-up needs
  amending: a headless record is pane-less and must also be exempt.
- **Standing owners:** a headless unit can `unit claim` a standing owner, and owner mail then
  starts a turn on it (C2.3). That makes a headless presence the natural shape for an unattended
  owner such as a cron-driven Operator. It never prompts a human, and `relay-governance` already
  routes a headless agent's needs-input up its relay.

### C2.7 Permissions — load-bearing, and a leash question

A print-mode turn cannot ask for approval. Each harness either refuses the action (Cursor rejected
every shell command without `--force`) or falls back to the settings default (Claude). So the
spawn has to fix the unit's permissions up front and re-apply them on every turn. That is the
"leash granted at spawn" of `agent-communication-mechanisms` C6.3, made concrete. Which modes a
headless unit may be spawned with (Claude `acceptEdits` or `auto`, Codex `workspace-write`, Cursor
`--force`) is a policy decision for the ADR. It is not a mechanism detail.

## C3. How this relates to the open issues

- **#189 (workspace with no session): a prerequisite.** A headless spawn needs exactly the
  "acquire a worktree with no pane binding" that #189 asks for. Building #189 first gives the
  headless placement its worktree step for free. Its open question ("should the sub-agent be
  registered as a unit?") gets a clean answer for headless units: yes, because a headless unit is
  a unit with a record and a lease, even though it has no pane.
- **#242 (conversation id when hooks cannot run): solved for headless units, untouched for pane
  units.** A headless spawn records `conversation` from the harness's output (C2.1). The herdr
  `agent_session` read #242 proposes is still needed for pane units. Separately, E3.2 shows the
  Cursor hook's id is the chat id, so Cursor can join `RESUME_MAP`, with the condition that it
  must resume in the unit's own cwd (E3.3).
- **#241 (multiplexer session on the pane record): a scoping rule to add.** A headless unit is in
  no multiplexer session. A sweep scoped to "units in my mux session" must leave headless units
  alone, and `who` needs a way to list them (for example a `headless` placement filter).
- **`subagent-backend-governance`:** headless units are a third dispatch strategy, beside panes
  and the caller's Task tool. They suit work that must outlive the caller's turn, or that a human
  may want to attach to later. The Task-tool path stays the cheaper choice for one-shot work that
  returns a verdict inside the caller's turn.

## C4. Recommendation

**Build it, in this order:**

1. #189 first. It is the worktree step.
2. Then a headless placement for Claude Code and Codex: C2.1 through C2.6, with the turn lock from
   the start.
3. Cursor last. Its resume is workspace-scoped, its print-mode hooks mostly don't fire, and its
   shell is unusable without `--force`. All of that can be handled, but Cursor needs the most care
   and has had the least testing.

Write the ADR (draft text in [changes.md](./changes.md)) before the code. The load-bearing parts
are the record's placement field, the turn lock, and the permission policy, and those are the
parts an ADR should settle.

**What does not block it:** the harnesses' support, which all three have. **What would:** shipping
path F without the turn lock. On Claude and Cursor that loses turns silently, which is worse than
having no headless mode.

## C5. Not verified

- Whether *trusted* Codex project hooks fire under `exec`. The trust-bypass flag was not run (E2.2).
- Whether `codex queue` reaches a session live in the interactive client, and what `codex agents`
  offers as a switcher (E2.6).
- Whether Claude's interactive resume restores a saved non-default permission mode. The saved mode
  in the test was the default (E1.4).
- Whether a Cursor resume while a `-p` turn is mid-tool-call behaves like the tested open-session case.
- Any of it on macOS or Windows, or on newer harness versions. Codex 0.167.0 was already out.
