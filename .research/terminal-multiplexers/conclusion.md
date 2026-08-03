# Terminal multiplexers for agent-session orchestration (July 2026)

Distilled survey. **Motivation:** cyberlegion spawns agent sessions as panes, isolates each in its own git worktree, and injects input over a multiplexer backend (herdr today). This surveys the multiplexer landscape across the axes that matter for that job — programmatic spawning, send-keys injection, and worktree isolation.

**Method:** fan-out web research, 20 sources fetched, 90 claims extracted, 25 adversarially verified (24 confirmed, 1 refuted). Confidence is annotated per finding; source quality is uneven and called out below.

---

## Feature matrix

| Axis | tmux | Zellij | WezTerm | herdr | abduco (+dvtm) |
| --- | --- | --- | --- | --- | --- |
| **Persistence / detach-reattach** | ✅ client-server | ✅ + headless bg (`attach --create-background`) | ✅ built-in mux | ✅ bg server, reattach over SSH/phone | ✅ (its only job) |
| **Panes / layouts** | ✅ mature | ✅ + KDL layouts | ✅ | ✅ real PTY per pane | ❌ delegates to dvtm |
| **Scripting / IPC API** | ✅ full CLI | ✅ subprocess CLI, JSON on stdout, no socket | ✅ `wezterm cli` | ✅ JSON Unix-socket API + CLI | ❌ |
| **Keystroke injection** | ✅ `send-keys` | ✅ native `send-keys`/`write-chars`/`paste` | ✅ `send-text` (pastes, not raw keys) | ✅ `send_text`/`send_keys`/`send_input` | ❌ |
| **Plugin ecosystem** | ✅ largest (TPM) | 🟡 growing (WASM) | 🟡 Lua config | ❌ purpose-built | ❌ |
| **Multi-client sharing** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Git worktree** | ❌ manual | ❌ manual | ❌ | ✅ native (see below) | ❌ |

Not covered by surviving claims: **GNU screen, dtach, Byobu, dvtm** (dvtm appears only incidentally as abduco's tiling companion). This survey is silent on their specific feature sets.

---

## Per-tool notes

### tmux — the automation baseline
Client-server model; the server owns sessions independent of clients. Fully scriptable non-interactive lifecycle (`new-session`, `new-window`, `split-window`, `resize-pane`, `kill-*`) plus `send-keys` keystroke injection (`send-keys 'cmd' C-m`, where `C-m` = Enter). Multiple clients can attach to one session simultaneously. Largest plugin ecosystem (TPM). No native git-worktree support — docs say use git manually. *(high confidence; direct binary verification via `tmux list-commands`)*

### Zellij — structured CLI automation
Programmatic control is exposed **entirely through subprocess CLI invocation with JSON on stdout** — no socket, HTTP, or library binding (an in-process WASM plugin API also exists; "entirely" scopes to the external control surface). Mutating commands (`new-pane`, `paste`, `write-chars`, `send-keys`, `close-pane`) accept `--pane-id`; `paste` uses bracketed-paste mode for multi-line correctness. Headless sessions via `zellij attach --create-background`, driven externally with `--session`. **Native send-keys** is built in — the claim that it lacks one was refuted 0-3; the third-party `zellij-send-keys` WASM plugin is a convenience (STDIN + optional Enter), not a substitute. No native worktree. *(high confidence; official docs)*

### WezTerm — built-in multiplexer via `wezterm cli`
`wezterm cli` drives a running GUI/mux instance: `spawn` (new windows/tabs), `split-pane` (divide panes), `send-text` (inject into a pane via `--pane-id`). Note `send-text` **pastes** rather than emitting arbitrary key events. No native worktree. *(high confidence; official docs)*

### herdr — purpose-built agent multiplexer
Single ~10 MB Rust binary, no deps. Runs multiple coding-agent sessions, each in its own real terminal; a background server keeps panes and agents alive for detach/reattach from any terminal (including phone over SSH). Prefix key `ctrl+b` (tmux muscle-memory). Exposes a **local JSON Unix-socket API** (newline-delimited JSON-RPC) plus CLI: `workspace.create/list/focus/close`, `pane.split/zoom`, `pane.send_text/send_keys/send_input`, `pane.read` (visible/recent), `events.subscribe` (`pane.created/closed`, `agent_status_changed`), `events.wait`. **Native git worktree** via `herdr worktree create`, mapping a branch → its own workspace. *(high confidence on API/persistence; the worktree command is well-sourced but from herdr's own docs — see caveat)*

### RMUX — emerging, typed SDKs
Typed programmable SDKs in Rust (`rmux-sdk`), Python (`librmux`), TypeScript (`@rmux/sdk`) connecting to a local daemon. Playwright-style automation: `send_text`, `wait_for_text`, `snapshot()`, `pane()`. Tagline "usable like tmux, automated like Playwright." No native worktree. *(medium confidence — brand-new 2026, vendor/registry sources only, maturity unproven; treat as experimental)*

### abduco (+dvtm) — persistence only
abduco runs programs independently of their controlling terminal (detach/background/reattach); sessions survive SSH disconnect and terminal close. Deliberately provides **no** window/pane management — pair with dvtm for tiling. The clean split: session management (abduco) usable separately from tiling (dvtm). No scripting API, no send-keys, no worktree. *(high confidence)*

---

## Git-worktree isolation — the key axis

**General multiplexers ship none of it.** tmux and Zellij docs explicitly say "use git manually." The worktree-per-session workflow is supplied by external glue:

- **workmux** (verified): *not* a multiplexer — orchestration on top of tmux (also targets zellij/kitty). One command creates a git worktree **and** a matching tmux window (isolated per-branch dir under `__worktrees`), built explicitly for parallel AI-agent development. It **auto-injects a configured prompt** into panes whose command matches the configured agent.
- Others in the wild: muxtree, tmux-git-worktree, zellij-worktree.

**The agent-native tools are the exception.** herdr bakes worktrees in via `herdr worktree create` — worktree isolation *is* a first-class primitive, not external glue. This is the one place the general "no multiplexer ships native worktree integration" claim under-counts: it holds for tmux/Zellij/WezTerm, but herdr (and its niche) is the deliberate counterexample.

---

## Recommendation for agent orchestration

The job — spawn a pane, isolate each session in its own worktree, inject input — decomposes into a **scriptable multiplexer** + a **worktree layer**. Two viable stacks:

1. **General mux + worktree glue.** tmux / Zellij / WezTerm (mature, scriptable send-keys) **+ workmux** for worktrees. Most battle-tested; the multiplexer stays worktree-agnostic and the glue owns branch isolation.
2. **Agent-native mux.** herdr (JSON socket API + native worktrees) or RMUX (typed SDKs, Playwright-style waits; no native worktrees). Richer automation surface, fewer moving parts for the agent case.

cyberlegion sits on stack shape #2: it drives herdr's socket for pane spawn + send-keys, and layers **its own** git-worktree logic on top rather than delegating to `herdr worktree create`. That own-worktree layer is where the observed `refs/heads/cyberlegion` directory/file collision originates (a `cyberlegion/unit-<id>` branch cannot be created while a leaf `cyberlegion` branch exists) — it is cyberlegion's concern, not herdr's.

---

## Caveats

- **RMUX** is the weakest-sourced: brand-new (2026), vendor/registry docs only, no independent benchmarks. Experimental.
- **herdr / workmux** claims lean substantially on their own READMEs/landing pages (some marketing tone). The capabilities are architecturally standard, so this is credible, but no third-party benchmarks were reviewed.
- Comparative scriptability ratings (tmux "high" vs Zellij "moderate") come from Feb-2026 blogs and are subjective; one blog imprecisely blames Zellij scripting difficulty on "learning KDL" — KDL is the config/layout format, while actual scripting is via CLI actions and WASM plugins.
- **Time-sensitive:** Zellij's CLI-automation surface (0.44.0), herdr, RMUX, and workmux are all 2025-2026 and evolving fast.
- **Coverage gap:** GNU screen, dtach, Byobu, and dvtm were in scope but produced no surviving claims.

---

## Open questions

- How do GNU screen, dtach, Byobu, and dvtm compare on scripting/IPC and send-keys?
- How mature is RMUX in practice, and how does its typed multi-language SDK approach compare to herdr's JSON-socket API for real agent workloads?
- Do herdr or RMUX plan to close (herdr) or open (RMUX) the native-worktree gap?

## Sources

Primary: [wezterm cli](https://wezterm.org/cli/cli/index.html), [wezterm send-text](https://wezterm.org/cli/cli/send-text.html), [Zellij programmatic control](https://zellij.dev/documentation/programmatic-control.html), [Zellij CLI recipes](https://zellij.dev/documentation/cli-recipes.html), [herdr (GitHub)](https://github.com/ogulcancelik/herdr), [herdr.dev](https://herdr.dev/), [herdr socket API](https://herdr.dev/docs/socket-api), [workmux](https://github.com/raine/workmux), [zellij-send-keys](https://github.com/atani/zellij-send-keys), [rmux.io](https://rmux.io/), [RMUX (GitHub)](https://github.com/Helvesec/rmux).

Secondary/blog: [tmux.app/alternatives](https://tmux.app/alternatives/), [dasroot tmux vs zellij](https://dasroot.net/posts/2026/02/terminal-multiplexers-tmux-vs-zellij-comparison/), [termdock comparison](https://www.termdock.com/en/blog/terminal-multiplexing-tmux-termdock-zellij), [terminal.guide abduco](https://www.terminal.guide/tools/multiplexer/abduco/), [Dan MacKinlay — terminal session management](https://danmackinlay.name/notebook/terminal_session_management.html).
