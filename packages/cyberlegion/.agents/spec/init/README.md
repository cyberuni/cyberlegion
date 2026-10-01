---
spec-type: behavioral
concept: [cyberlegion]
---

# init — the onboarding front door

One command that gets a project ready to surface Legion mail: resolve this session's harness and
register the SessionStart surfacing hook, then point the human at binding a durable owner inbox. It is
the friendly, auto-detecting entry a human (or the `init-cyberlegion` skill that wraps it) runs once;
the hook mechanics themselves (the injection payload) live in `mail/surface`.

`init` now **owns installation** directly. CR-2 (`cyberlegion-cli-realign`, ADR-0024) dissolved
`surfacing/` and folded its per-harness `admin install` into `init`: rather than duplicate those
scenarios, `init.feature`'s coverage was extended to add the codex path (SessionStart + PostToolUse)
it previously lacked (CR-2 resolution #2). `admin doctor`/`mode` moved to `mux/`; minting the owner
inbox is `unit/registry` and binding the read-pane is `attach/`.

## Use Cases

**Subject** — a session bootstrapping the Legion surfacing hook into its project without being told
which harness it runs under:

- **init resolves the harness and registers the surfacing hook** — `cyberlegion init [--agent
  claude|cursor|codex] [--dir <path>] [--pin <version>]` resolves the harness — an explicit `--agent`
  (validated against `claude | cursor | codex`, throwing on anything else) always wins; absent it, the
  same layered harness detection `unit register` uses auto-detects it — and makes sure the surfacing
  hook fires with **the CLI the session was installed with**, never one npx resolves from the registry
  at run time (#65, #69). What that takes depends on the harness:
  - **claude, codex — the plugin ships the hook.** The plugin's own `hooks/hooks.json` runs `node
    "${CLAUDE_PLUGIN_ROOT}/bin/cyberlegion.mjs" mail hook --event <event>` for SessionStart and
    PostToolUse. `${CLAUDE_PLUGIN_ROOT}` is the installed plugin copy (Codex sets it too, for
    compatibility), and `dist/cli.mjs` is committed, so the hook runs offline at exactly the enabled
    version. `init` therefore writes **no** project hook for these harnesses and reports each event as
    `provided by plugin`; a project hook an earlier `init` wrote is **removed** (reported `removed
    project hook`), otherwise the hook would fire twice. It creates no config file that did not exist.
  - **cursor — a PATH-first project hook.** Cursor's plugin is not built by this package, so `init`
    registers into `.cursor/hooks.json` `if command -v cyberlegion >/dev/null 2>&1; then cyberlegion
    mail hook --event <event>; else npx -y cyberlegion[@<pin>] mail hook --event <event>; fi`. A
    `cyberlegion` on PATH (a spawned unit's shim, or a deliberate install) wins; the npx fallback runs
    only when there is none. `if/then/else`, not `&& … ||`, so a failing PATH run never also runs npx.
  `--pin` fixes only the version the npx fallback fetches (the `init-cyberlegion` skill passes the
  plugin's `.plugin/pins.json` version, which the release version flow keeps current). It is
  **validated** as a single npm version-or-dist-tag token before it is embedded — a malformed pin
  (empty, whitespace, a range, or a shell metacharacter) is rejected and no hook is registered. Each
  event is reported as `registered`, `already present`, `provided by plugin`, or `removed project hook`.
- **init auto-detects; installation is otherwise explicit** — `init` adds auto-detection and an
  owner-binding next-step for onboarding, on top of the low-level installer (see the TODO above for
  where that installer's own pending scenarios currently live). `init` never chooses a harness by
  guessing: when nothing detects and no `--agent` is given, it throws asking for `--agent` rather
  than picking one.
- **init points at owner binding when none is bound** — after registering, when no standing owner
  inbox exists yet, `init` emits a next-step toward minting and binding the durable owner inbox
  (`unit register --standing` / `attach`); when a standing owner already exists it emits no such
  next-step. `init` itself never mints an owner or binds a pane — it only registers the hook and
  advises the binding step (which the human confirms).
- **init is idempotent** — re-running `init` for an already-installed project re-reports `already
  present` for each hook rather than duplicating an entry, exactly as the underlying installer does.
  Matching is by the dedicated `mail hook --event <event>` command run through `cyberlegion`, not the
  exact string, so every earlier generation — legacy bare `cyberlegion mail hook …`, unpinned or
  pinned `npx cyberlegion[@<v>] mail hook …`, and the PATH-first form at another pin — is recognised:
  rewritten in place for cursor, removed for a plugin-hook harness. Each generation is matched as the
  whole command, so a hook that is not one of them (a user's wrapper that calls cyberlegion, say) is
  never touched.

**Non-goals** — the hook injection payload and owner-mail surfacing gate (`mail/surface`);
multiplexer/harness self-diagnosis via `mux doctor` (`mux/`); minting the standing owner inbox and
binding the main pane (`unit/registry` / `attach/`); the user-facing interactive ask (the
`init-cyberlegion` plugin skill that wraps this verb). This node owns only the auto-detecting
hook-registration entry point and its owner-binding advice — plus, pending CR-2 resolution #2, the
low-level per-harness installer it will absorb (see the TODO above).

Every scenario in [`init.feature`](./init.feature) maps to one of these behaviors:

| Behavior | What it covers |
|---|---|
| **resolve + register** | auto-detect harness (or `--agent`); leave the hook to the plugin for claude/codex, register the PATH-first SessionStart hook for cursor |
| **pin** | `--pin` pins only cursor's npx fallback; a malformed pin is rejected before anything is written |
| **auto-detect vs explicit** | `--agent` overrides + is validated; undetectable with no `--agent` throws asking for it, never guesses |
| **owner-binding next-step** | emits a bind-owner next-step only when no standing owner exists |
| **idempotent + upgrade** | re-run reports `already present`, rewrites an older cursor generation in place, removes an earlier project hook where the plugin ships it |
