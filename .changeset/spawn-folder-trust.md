---
'cyberlegion': patch
---

`unit spawn` no longer hangs silently at a harness's folder-trust prompt. A spawn that creates a worktree accepts the prompt (Claude Code: Down, then Enter, checked against the screen so Enter never lands on "No, exit"; Codex: `1`, then Enter; cursor-agent: `a`). A `--cwd` spawn leaves the prompt for a person. A prompt left showing either way rings nothing, names the folder, harness, and pane on stderr, and exits non-zero. The first-turn doorbell now waits until the prompt is answered: typed into the prompt, its Enter quit Claude Code and an `a` in its text answered cursor-agent's prompt.
