# Changes — headless spawn and resume

The work this research proposes. None of it is done, and no ADR or issue has been filed.

## Proposed

| # | Change | Source | Status |
| --- | --- | --- | --- |
| P1 | ADR: headless units, delivered by resume turns under a per-unit turn lock (draft below) | [conclusion.md](./conclusion.md) C1, C2 | proposed |
| P2 | Issue: a headless spawn placement for Claude Code and Codex (draft below) | C2.1–C2.6, C4 | proposed, blocked by #189 |
| P3 | Issue: add Cursor to `RESUME_MAP`, resuming in the unit's own cwd (draft below) | evidence E3.2, E3.3; C3 | proposed, independent |
| P4 | Comment on #242: a headless spawn records `conversation` from the harness output. The herdr read is still needed for pane units | C3 | proposed |
| P5 | Comment on #241: a sweep scoped to a mux session must leave headless units alone | C3 | proposed |
| P6 | Amend `harness-hooks` follow-up 4 (prune staleness) so a headless record is exempt, not only a pane-less one under a 15-minute timer | C2.6 | proposed |
| P7 | Add path **F, resume turn** to the `agent-session-wake` wake-path table, with a link here | C1 | proposed |

## Declined

| Change | Reason |
| --- | --- |
| Build headless units on `claude --bg` | Claude-only. It cannot receive a turn without an attached terminal, `--bg --resume` on a running session silently forks a copy, and it refuses `-p --resume` while running. It can be revisited as an optional second Claude mode. C2.5 |
| Use `agent persist` as Cursor's headless host | It is a private tmux server, so it is not mux-free and needs tmux installed. Evidence E3.6 |
| Use `codex queue` as the mailbox for Codex units | It would give Codex a second mailbox with its own unread state and no sender, thread, or ack. C2.3 |
| Put the mail payload in the resume-turn prompt | A print-mode prompt is a user turn, on the authority plane. That would make peer mail authoritative (`agent-communication-mechanisms` C2). C2.3 |
| Ship resume turns without cyberlegion's own turn lock | Claude and Cursor silently lose a turn when two resumes overlap. Evidence E1.5, E3.5 |

## Deferred

| Change | Trigger to revisit |
| --- | --- |
| A `claude --bg` mode for Claude headless units | A user wants a warm, attachable Claude unit and accepts the Claude-only limits |
| `codex queue` as the doorbell for a Codex unit live in an interactive client | Someone confirms it reaches a live session (untested, C5) |
| D3: read the READMEs of the control planes in the knowledge base (`zeron`, `mission-control`, `agent-orchestrator`, `orca`, `superset`, `symphony`) for how they spawn and resume | Before the ADR is ratified, in case one already solves turn serialization |

---

## Draft P1 — ADR

```markdown
# ADR-00NN: Headless units are turn-driven, delivered by resume turns under a turn lock

## Status

Proposed

## Context

Every unit today is an interactive session in a multiplexer pane, and the doorbell, `read`,
`nudge`, and `restart` all act on that pane. With no multiplexer, cyberlegion can only hand work to
the caller's own Task tool (`subagent-backend-governance`), which gives no unit record, no mail
address, and nothing to attach to later.

Claude Code (`-p`), Codex (`exec`), and Cursor (`agent -p`) all run one turn non-interactively,
report a conversation id, and resume that id later, either non-interactively or in an interactive
terminal (`.research/headless-spawn-and-resume`). Concurrent resumes of one id silently lose a turn
on Claude Code and Cursor. Codex refuses the second writer.

## Decision

1. **A headless placement.** `unit spawn` can place a unit with no pane. Its record carries
   `placement: 'headless'`, `pane: null`, the conversation id captured at spawn (Claude
   `--session-id`, Cursor `create-chat`, Codex `thread.started`), and a per-turn launch recipe that
   holds every flag a resume does not inherit: permission mode, tool allowlist, sandbox, and model.
2. **Turns are delivered by resume.** A turn is one
   `<harness> -p --resume <id> <recipe> "<prompt>"` process, run detached in the unit's cwd by
   `unit turn`. Spawn, `mail send`, and `unit nudge` request turns.
3. **One turn at a time, enforced by cyberlegion.** `unit turn` holds an exclusive per-unit turn
   lock for the life of the process. A turn requested while the lock is held is coalesced into a
   "turn wanted" flag and runs when the current turn ends. Unread mail is drained the same way.
   The harness's own lock, where one exists, is never relied on.
4. **The prompt is a doorbell, never the payload.** A delivery turn's prompt is
   `DELIVERY_DOORBELL`. Mail content stays in the mailbox, so peer mail never rides a user turn.
5. **Attach is a lock holder.** `unit attach` takes the turn lock and runs the harness's
   interactive resume in the caller's terminal. On exit it releases the lock and drains the queue.
6. **Liveness without a heartbeat.** A headless unit is idle between turns and is never
   stale-pruned for an old `lastSeen`. A running turn is known by the runner's pid.
7. **Permissions are fixed at spawn.** A headless unit cannot ask for approval. Which permission
   modes a headless spawn may request is set by <policy to decide>.

## Consequences

- Units can run, receive mail, and be attached to with no multiplexer installed.
- An idle unit costs nothing. Each turn costs a cold process start and a context re-read, which is
  uncached after the prompt-cache TTL.
- Every reader of `pane` handles `placement: 'headless'` as its own case.
- Cursor units must resume in their own workspace, because a resume elsewhere silently opens an
  empty chat.
- `who` gains a headless filter. Sweeps scoped to a multiplexer session skip headless units.
```

## Draft P2 — issue

```markdown
Title: Spawn a headless unit: no pane, turns delivered by `--resume`

## Description

With no multiplexer, `unit spawn` cannot place a unit. Claude Code (`-p`) and Codex (`exec`) both
run a turn non-interactively and resume it by id, interactively or not
(`.research/headless-spawn-and-resume`). cyberlegion can host a unit as a conversation id plus a
per-turn launch recipe, and deliver each turn as a fresh resume.

## Expected behavior

- `unit spawn --headless` acquires the worktree (#189), records `placement: 'headless'`, records the
  conversation id from the harness, and runs the first turn with the spawn wake prompt.
- `mail send` to a headless unit starts a turn with the delivery doorbell.
- Turns on one unit never overlap. A request during a turn is coalesced and runs after it.
- `unit read` tails the unit's turn log. `unit nudge` runs a turn with the given text.
- `unit attach` waits for any running turn, then opens the harness's interactive resume in the
  caller's terminal, holding the lock until exit.
- `prune` never marks an idle headless unit stale.

## Notes

- Blocked by #189.
- Claude Code and Codex first. Cursor follows once its resume-in-cwd is in place.
- Resume does not inherit the permission mode or the tool allowlist. The recipe re-applies them on
  every turn.
```

## Draft P3 — issue

```markdown
Title: Resume Cursor units by chat id on `unit restart`

`RESUME_MAP` leaves Cursor out because its hook's id was not confirmed to be the chat id. Tested
on Cursor agent 2026.09.28: the `sessionStart` hook's `conversation_id` equals the `session_id`
that `agent -p --output-format json` reports, and `agent --resume <id>` takes it.

Cursor chats are stored per workspace, so a resume from another directory silently opens an empty
chat under the same id. The resume has to run in the unit's recorded cwd, which `unit restart`
already uses.

Add `cursor: (id) => \`--resume ${shellQuote(id)}\`` to `RESUME_MAP`, plus a test that the restart
launch runs in the record's cwd.
```
