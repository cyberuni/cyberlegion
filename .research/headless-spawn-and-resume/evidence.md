# Evidence — headless spawn and resume

Everything marked **tested** was run on 2026-11-08 on Linux (WSL2) against the versions below. A
claim marked **documented** comes from the official page cited, and one marked **reported** comes
from an issue or forum thread. tmux (3.7c) was used only as a test terminal for the interactive
runs, never as part of what was being tested.

| Harness | Version tested | Model used |
| --- | --- | --- |
| Claude Code | 2.1.319 | `haiku` |
| Codex CLI | 0.159.3 (0.167.0 was available) | `gpt-5.6-luna`. The configured default, `gpt-6-astra`, is refused on a ChatGPT-account login. |
| Cursor agent CLI | 2026.09.28-64d2043 | `auto`. Named models are refused on the Free plan. |

Each experiment followed the same script. A print-mode session is told a codeword (`PELICAN-42`).
Later turns, run in different modes, add more codewords (`HERON-7`, `OSPREY-9`, `KESTREL-3`, and so
on). Asking "list every codeword you know" then shows which turns each process can see. Each
scratch project carried logging hooks that append the hook's JSON input to a file.

## E1. Claude Code

### E1.1 Spawn in print mode — tested

`claude -p "<prompt>" --output-format json --permission-mode acceptEdits --allowedTools "Bash(pwd)"`
ran 2 turns in 9.9 s and exited 0. The JSON result carries `session_id`, `result`, `num_turns`, and
`permission_denials`.

- `--session-id <uuid>` makes the caller choose the id. The result's `session_id` matched the
  supplied UUID. The spawner therefore knows the conversation id **before** the first turn runs.
- Without `</dev/null`, `-p` waits 3 s for stdin and prints a warning. A spawner should close stdin.
- The transcript was written to
  `~/.claude/projects/<cwd with non-alphanumerics replaced by '->/<session-id>.jsonl`.

### E1.2 Hooks under `-p` — tested

All four configured project hooks fired on the first `-p` run, in this order: `SessionStart`
(`source: "startup"`), `UserPromptSubmit`, `Stop` (`permission_mode: "acceptEdits"`), and
`SessionEnd` (`reason: "other"`). On `-p --resume`, `SessionStart` fired with `source: "resume"`.
The documentation agrees: without `--bare`, a `-p` session runs the project's hooks, and `--bare`
skips them ([headless](https://code.claude.com/docs/en/headless)). The cyberlegion plugin's own
SessionStart hook is a plugin hook, and plugin hooks also ran: the background session's terminal
showed `running SessionStart hooks… 0/4`.

### E1.3 Resume in print mode — tested

| Case | Result |
| --- | --- |
| `-p --resume <id>`, same cwd, no permission flags | Full history (knew `PELICAN-42`). The `Stop` hook reported `permission_mode: "auto"`, the user's `defaultMode`, **not** the original `acceptEdits`. |
| `-p --resume <id>` from a different directory | Full history. The session now runs in the **new** directory, and the model remarked that the cwd had changed. The original project's hooks did not fire, because they are project-scoped and the new cwd has none. The transcript stays in the original project's folder. |

The documentation agrees: `--resume <id>` searches the current project, then every other project
on the machine. `-p --resume` starts in the permission mode a new `-p` run would use. Flags such
as `--mcp-config`, `--settings`, `--plugin-dir`, and `--add-dir` are not restored
([sessions](https://code.claude.com/docs/en/sessions)). Neither is `--allowedTools`, the test
showed: the second `pwd` ran only because the default mode (`auto`) allowed it.

### E1.4 Resume interactively — tested

`claude --resume <id>` in a terminal:

- **First, a workspace-trust prompt.** `-p` had skipped it, so the folder had never been trusted.
  A worktree created for a headless unit will hit this prompt the first time a human attaches.
- After trusting the folder, the session showed **all** earlier turns, including the turn resumed
  from the other directory, and accepted a new interactive turn.
- The status line showed `auto mode on`. The documentation says an interactive resume restores the
  saved mode. That could not be told apart here, because the saved mode was already `auto`.
- `-p` and SDK sessions are hidden from the interactive picker and from interactive `--continue`.
  They can be resumed only by explicit id (documented, [sessions](https://code.claude.com/docs/en/sessions)).
  A spawner must record the id. It cannot rediscover it later with `--continue`.

### E1.5 Concurrency between plain processes — tested

There is **no lock** between two ordinary Claude processes on one session id.

1. *Interactive session open, `-p --resume` of the same id.* The `-p` turn ran and exited 0. It
   could not see the turn the interactive session had just taken (`HERON-7`). The interactive
   session, in turn, did not see the `-p` turn. The transcript JSONL now held **two branches**
   forked from the same parent message. The parent-chain walks are recorded below.
2. *After the interactive session exited, a fresh `-p --resume`.* It continued the branch written
   **last**, the interactive one, and knew `HERON-7`. The `-p` branch was no longer visible.
3. *A `-p` turn running a 25 s build, and a second `-p --resume` started 12 s in.* The second turn
   exited 0 and reported the first turn's in-flight tool call as "interrupted". The first turn then
   finished normally, but never saw the second turn's codeword (`KESTREL-3`). The next resume
   followed the first turn's branch, so `KESTREL-3` was **silently lost**. The model even "corrected"
   its own earlier reply, because it was confused by the interrupted tool call it could see.

```
chain from the interactive turn:  PELICAN → codeword? → codeword? → "Interactive turn: HERON-7"
chain from the concurrent -p turn: PELICAN → codeword? → codeword? → "List every codeword"
```

The documentation states the behavior without calling it a lock: "If you resume the same session
in two terminals without forking, messages from both interleave into one transcript"
([sessions](https://code.claude.com/docs/en/sessions)). Reported issues match: anthropics/claude-code
#39151 (two terminals writing one JSONL), #75761 (resume while the original process is alive),
#83719 (two VS Code windows fork the transcript and drop a branch, open), #68704 (a requested
`--exclusive` per-session lock, closed). These were read through the claudeissues.com mirror
([example](https://claudeissues.com/issue/39151-claude-resume-allows-concurrent-access-to-same-session-from-multiple-terminals)).

### E1.6 Background sessions (`--bg`) — tested

Claude Code ships its own mux-free host for sessions:

- `claude --bg --resume <id> "<prompt>"` printed `backgrounded · 094858fb` and returned at once.
  It continued the `-p` session **under the same id**.
- `claude agents --json` lists active interactive and background sessions:
  `{id, sessionId, name, cwd, kind: "background", state, startedAt}`. It does not need a TTY.
- `claude logs <id>` prints the session's recent **terminal output**: raw ANSI screen frames, not
  structured events.
- `claude attach <id>` opened the session in a terminal with the full history (every `-p`,
  interactive, and background turn) and took a new turn. Closing the attached terminal left the
  session running.
- `claude stop <id>` stops the session and keeps the conversation. `-p --resume` worked again
  afterwards. `claude rm <id>` deletes it, along with its worktree when that is safe.
- **This path has a lock.** While the session ran in the background, `-p --resume <id>` exited 1
  with: `That session is running in the background (094858fb). Run claude attach 094858fb to open
  it, or claude stop 094858fb first to resume it here. Add --fork-session to branch off a copy
  instead.`
- **A turn cannot be delivered without attaching.** `claude --bg --resume <id> "<prompt>"` against
  a running background session started a **copy** under a new id (`62dbe196`) and said so. It did
  not hand the turn to the running session. No CLI command sends a prompt into a running
  background session.
- The host is Claude's own supervisor (`~/.claude/daemon/`, `~/.claude/daemon.log`). No tmux was
  involved. The supervisor exits after 5 s with no clients and no live workers.

## E2. Codex CLI

### E2.1 Spawn in print mode — tested

`codex exec --json --skip-git-repo-check -s workspace-write -m gpt-5.6-luna "<prompt>"` exited 0.
The first JSONL event is `{"type":"thread.started","thread_id":"<uuid>"}`, so the id is known as
soon as the process starts, before any model work. There is no flag to choose the id in advance.
The rollout was written to `~/.codex/sessions/YYYY/MM/DD/rollout-<timestamp>-<thread id>.jsonl`.
`codex exec` also has `--worktree` ("Run the session in a new managed Git worktree") and
`--ephemeral` (no rollout). The documentation lists the same events and `exec resume`
([non-interactive mode](https://developers.openai.com/codex/noninteractive)).

### E2.2 Hooks under `exec` — partly tested

- **Plugin hooks load under `exec`.** Every run emitted an error item naming an installed plugin's
  hook file: `clamping SessionEnd hook timeout to 3s in …/plugins/cache/openai-codex/codex/1.0.6/hooks/hooks.json`.
- **Untrusted project hooks are skipped silently under `exec`.** The scratch project's
  `.codex/hooks.json` (`SessionStart`, `Stop`) never fired. The interactive client, on the same
  project, stopped at "Hooks need review: 2 hooks are new or changed", with options to review,
  trust all, or continue without trusting. Running `exec` with `--dangerously-bypass-hook-trust`
  was not attempted, because this session's permission policy denied the flag. So whether
  *trusted* project hooks fire under `exec` is **not tested** here.
- The hook events are documented ([hooks](https://learn.chatgpt.com/docs/hooks)). Whether they run
  under `exec` is not documented.

### E2.3 Resume in print mode — tested

`codex exec resume --json <thread id> "<prompt>"` had the full history, from the same directory
and from a subdirectory. Run from the subdirectory, it reported the **launch** directory as its
cwd. Every `exec resume` re-emits `thread.started` with the same id.

### E2.4 Resume interactively — tested

`codex resume <thread id>`, run in a terminal:

1. It first reported **"Background server has incompatible feature settings"** and offered to run
   without the daemon, to restart the shared daemon with changed settings ("Restart may interrupt
   active or queued work"), or to cancel. The interactive client talks to a shared local
   `app-server` daemon, and this session's settings conflicted with it. The test chose "run
   without daemon".
2. Next came the hook-trust prompt (E2.2). The test continued without trusting.
3. The session showed every `exec` turn and accepted a new one. It opened in the **thread's last
   recorded directory** (the subdirectory of E2.3), not the directory it was launched from. Claude,
   by contrast, uses the launch directory.

### E2.5 Concurrency — tested

Codex enforces **one writer per thread**:

- With the interactive session open, `codex exec resume <id>` exited 1 at once with
  `thread/resume failed: thread <id> already has an active writer (code -32600)`, also logged as
  `thread-store conflict`.
- With one `exec resume` running a 25 s build, a second `exec resume` failed the same way. The
  first turn completed normally.
- After the interactive session exited, the lock was released and the next `exec resume` succeeded.

Reported elsewhere: openai/codex#11435 (parallel `exec` runs picking up each other's state, from
before the lock) and a community thread on the same `active writer` error
([forum](https://community.openai.com/t/reproducible-context-loss-after-crashes-and-transport-failures-in-recent-codex-desktop-releases/1394220)).
The app-server documentation describes `thread/resume` but no locking model
([app-server](https://developers.openai.com/codex/app-server)).

### E2.6 `codex queue` and `codex agents` — partly tested

- `codex queue --thread <id> --message "<text>"` printed `Queued message <id> for thread <id>.`
  The thread had no live session at the time. The queue lives in `~/.codex/queue_1.sqlite`. On the
  next `codex exec resume <id> "<prompt>"`, the agent **answered the queued message first** (it
  replied "OK") and then the new prompt. It also listed the queued codeword (`IBIS-1`). Codex
  therefore ships a durable per-thread inbox that is delivered on the next turn.
- **Not tested:** whether `codex queue` reaches a session that is live in the interactive client.
  Its help text says it talks to the shared app-server daemon, and testing it would have meant
  touching the user's shared daemon.
- `codex agents` ("Browse all agent sessions on the shared local app-server daemon") is a TUI over
  the same daemon. It was not opened. `codex app-server` exposes a long-lived JSON-RPC server
  (`thread/start`, `thread/resume`, `turn/start`) on stdio or a socket
  ([app-server](https://developers.openai.com/codex/app-server)).

## E3. Cursor agent CLI

### E3.1 Spawn in print mode — tested

`agent -p --output-format json --trust --model auto "<prompt>"` exited 0. The result carries
`session_id`. Without `--force`, every shell command was **rejected** (`$ pwd Rejected`), and the
agent worked around it by reading files. `agent create-chat` returns a new chat id **before** any
turn, and `-p --resume <that id>` used it (`session_id` matched).

### E3.2 Hooks under `-p` — tested

From `.cursor/hooks.json` (`sessionStart`, `stop`, `beforeSubmitPrompt`):

- `sessionStart` fired on the **new** chat. Its input carried `conversation_id` and `session_id`,
  both equal to the `session_id` in the `-p` JSON result and to the id `--resume` takes.
- `sessionStart` did **not** fire on any `-p --resume` turn.
- `stop` and `beforeSubmitPrompt` never fired under `-p`.

Forum reports conflict across versions on `stop`, and agree that `beforeSubmitPrompt` does not run
under `-p` ([1](https://forum.cursor.com/t/cursor-cli-omits-beforesubmitprompt-afteragentresponse-and-stop-hooks-loses-token-usage-and-emits-inconsistent-generation-id-values/169059),
[2](https://forum.cursor.com/t/cursor-cli-does-not-run-enterprise-or-team-beforesubmitprompt-hooks/173219)).

### E3.3 Resume in print mode — tested; **workspace-scoped**

| Case | Result |
| --- | --- |
| `-p --resume <id>`, same directory | Full history. |
| `-p --resume <id>` from a directory outside the project | Told to answer from memory only, it said `NO HISTORY`. |
| `-p --resume <id>` from a subdirectory | It saw only what that directory's copy had picked up earlier, not later turns. |

Chats are stored per workspace: `~/.cursor/chats/<hash of workspace path>/<chat id>/store.db`
(SQLite) plus `meta.json`, and `~/.cursor/projects/<workspace slug>/agent-transcripts/<chat id>`.
Resuming an id from another workspace **silently creates a second, empty chat under the same id**
in that workspace's folder. It neither errors nor finds the original. The format is undocumented. A
reverse-engineered description matches what was found
([txcript](https://docs.rs/crate/txcript/latest/source/docs/formats/cursor.md)).

### E3.4 Resume interactively — tested

`agent --resume <id>`, run in the original workspace, showed every `-p` turn and accepted new ones.

### E3.5 Concurrency — tested

There is no lock. The store is one SQLite file per chat.

- With the interactive session open, a `-p --resume` turn ran, and it **did** see the interactive
  session's latest turn (`OSPREY-9`). It reads the store fresh.
- A `-p` turn then added `KESTREL-3` while the interactive session stayed open. The interactive
  session's next turn did not know `KESTREL-3`. After it closed, a fresh resume did not know it
  either. The `-p` turn was **silently lost**: the long-lived process's next write won.

### E3.6 `agent persist` — tested

`agent persist [prompt]`, with `persist list | attach <session> | stop <session>`, keeps a session
alive across terminal and SSH disconnects.

- Run with no TTY, it exits 1 with `Persistence requires an interactive Linux or macOS terminal.`
- Inside an existing tmux pane it ran, but `persist list` showed nothing.
- Under a bare pseudo-terminal (`script`) it listed `Status: Attached (1 client)`. After the
  terminal died, the status changed to `Detached (running in background)`. `persist stop` ended it.
- **It is tmux underneath.** The host process was
  `tmux -u -L cursor-agent -f /dev/null new-session -d -s cursor-<workspace>-… -c <cwd>`, from the
  system tmux binary. Without tmux installed it cannot work, so it is not mux-free.

## E4. The owner's knowledge base

`~/code/unional/second-brain/stars/` records no mux-free tool with a documented headless resume
mechanism. Two entries say they drive sessions headlessly: `ybouane/dash-p` ("makes Claude Code
scriptable" through headless prompt mode and the Agent SDK) and `nanocoai/nanoclaw` (runs agents
on Anthropic's Agents SDK). Several control planes and agent IDEs (`zeronsh/zeron`,
`builderz-labs/mission-control`, `OrchestratorInc/agent-orchestrator`, `stablyai/orca`,
`superset-sh/superset`, `openai/symphony`) manage many agents. Their entries don't say how those
agents are spawned or resumed. Reading their READMEs is a follow-up (changes.md D3).

## E5. cyberlegion today

Read from `packages/cyberlegion/src` at `6691b65`:

- `AgentRecord.pane` is already nullable ("`null` for a session in no pane").
  `AgentRecord.conversation` is filled only by the SessionStart hook (`recordConversation`,
  `unit-runtime.ts`).
- `RESUME_MAP` (`session.ts`) maps `claude` to `--resume <id>` and `codex` to `resume <id>`. It
  leaves Cursor out, because "its hook's id is not confirmed to be the chat id". E3.2 confirms
  it: the hook's `conversation_id` **is** the chat id, at least for a chat spawned with `-p`.
- The doorbell (`console/doorbell.ts`, `wakeRecipient`) needs a pane to ring. With none, it does
  not ring.
- `subagent-backend-governance` covers the no-mux case today by handing the brief to the caller's
  own Task tool. cyberlegion "has no subagent-spawning primitive of its own by design".
