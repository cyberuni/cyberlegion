# Topic — headless spawn and resume

## Question

cyberlegion spawns every unit as an interactive session in a multiplexer pane (tmux or herdr), and
everything after spawn (the doorbell, `unit read`, `unit nudge`, `unit restart`) acts on that pane.
The Council asked three questions:

1. Can cyberlegion spawn a unit through a harness's non-interactive mode (`claude -p`,
   `codex exec`, Cursor's `agent -p`) instead of opening a pane?
2. With no multiplexer, can a human switch between such units: attach to one, see what it is
   doing, and give it a turn?
3. Can the harness's own resume (`claude --resume <id>`, `codex resume`, `agent --resume`) reopen
   a print-mode session interactively? What carries over (history, cwd, tools, permission mode,
   hooks), and what breaks? Answer this by running it, not only from the docs.

## Scope

- How a print-mode unit fits cyberlegion's model: the unit record, the missing pane, the
  conversation id, the mail doorbell, the SessionStart and Stop hooks, `unit close` and `prune`,
  and standing owners' presence and claim.
- Each harness's support, with versions tested and sources.
- Concurrency: two resumes of one session at once, and a resume while a print-mode turn runs.
- How this relates to open issues #189, #241, and #242, and to the dossiers
  [`agent-session-wake`](../agent-session-wake/conclusion.md),
  [`terminal-multiplexers`](../terminal-multiplexers/conclusion.md),
  [`harness-hooks`](../harness-hooks/conclusion.md), and
  [`agent-communication-mechanisms`](../agent-communication-mechanisms/conclusion.md). This dossier
  builds on them and does not repeat them.
- Tools in the owner's knowledge base that already spawn or resume headless sessions.

## Out of scope

- Implementing any of it. The deliverable is this dossier and a recommendation.
- Cloud sessions (`claude --cloud`, Codex Cloud, Cursor Cloud Agents).
- Windows. All tests ran on Linux (WSL2).

## Date

Researched 2026-11-08.
