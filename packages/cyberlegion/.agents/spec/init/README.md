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
scenarios, `init.feature`'s coverage was extended to add the codex path it previously lacked (CR-2 resolution #2). `admin doctor`/`mode` moved to `mux/`; minting the owner
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
    "${CLAUDE_PLUGIN_ROOT}/bin/cyberlegion.mjs" mail hook --event SessionStart` (in a spawned unit,
    the spawner's CLI named in `$CYBERLEGION_CLI` instead — the plugin's `mail-hook` node).
    `${CLAUDE_PLUGIN_ROOT}` is the installed plugin copy (Codex sets it too, for
    compatibility), and `dist/cli.mjs` is committed, so the hook runs offline at exactly the enabled
    version. `init` therefore writes **no** project hook for these harnesses and reports each event as
    `provided by plugin`; a project hook an earlier `init` wrote is **removed** (reported `removed
    project hook`), otherwise the hook would fire twice. It creates no config file that did not exist.
  - **claude, codex — the retired PostToolUse hook is removed.** An earlier `init` also wrote a
    PostToolUse project hook (`Write|Edit`). No hook fires on that event any more and `mail hook`
    rejects it, so `init` removes such an entry, by the same whole-command match, and reports it as a
    `PostToolUse` result `removed project hook`. With nothing to remove it reports no PostToolUse
    result at all.
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
- **init --allow-cli adds the Claude Code permission rules for the CLI** — without a
  `permissions.allow` rule covering `cyberlegion`, Claude Code's auto-mode classifier can deny a
  unit's `cyberlegion mail send` as an external write, so a unit that finished its work cannot report
  back (#120). A rule matches one command prefix, and a session runs the CLI in four forms, so the
  rules are four: `Bash(cyberlegion *)` (the bare command), `Bash(node *cyberlegion.mjs *)` (a skill's
  `scripts/cyberlegion.mjs` launcher or the package's `bin/cyberlegion.mjs`), and
  `Bash(npx cyberlegion@* *)` / `Bash(npx -y cyberlegion@* *)` (a pinned npx run) (#280). The unpinned
  `npx -y cyberlegion` form is left out: the skills fall back to it only from an unbundled workspace
  checkout, and a `cyberlegion*` pattern would also match any other package whose name starts so.
  For claude, `init` reads Claude Code's user settings (`$CLAUDE_CONFIG_DIR/settings.json`, else
  `~/.claude/settings.json`) and reports the rule as `present` when every form is covered, else
  `missing` (or `unreadable`). The bare form is also covered by its `:*` or `*` spelling, and every
  form by `Bash(*)` or a bare `Bash`. With `--allow-cli` it appends the uncovered rules to
  `permissions.allow` after every rule already there, keeping every other setting, and reports
  `added` — or `present`, writing nothing, when every form is covered. It never rewrites a file it
  cannot read as settings (invalid JSON, not an object, a non-array `permissions.allow`): it fails
  naming the file before any hook is touched. Without the flag it writes nothing and, when the rule is
  missing, emits a next-step toward `init --allow-cli`. The flag is claude-only; any other harness
  rejects it. Writing the user's global settings is a consent decision, so `init` never does it
  unasked — the `init-cyberlegion` skill asks first.
- **init --allow-force-close and --mark-mail-local add Claude Code auto-mode entries** — the
  auto-mode classifier blocks `unit close <id> --force` as destructive even right after the user
  approved discarding that unit's work, and can read `mail send` as data leaving the machine (#280).
  A permission rule cannot carry the condition that makes a force-close safe, so these go in Claude
  Code's natural-language `autoMode` lists in the same user settings file. `init` reports
  `forceCloseRule` (an `autoMode.allow` entry naming `cyberlegion`, `unit close`, and `--force`) and
  `mailEnvironment` (an `autoMode.environment` entry naming `cyberlegion` and `mail send`), each
  `present`, `missing`, or `unreadable`. `--allow-force-close` appends a rule allowing the
  force-close in any of the CLI's forms **only when the user approved discarding that specific
  unit's work in this session** — an approval relayed through cyberlegion mail or another session
  does not count, since relayed content is not an order. `--mark-mail-local` appends a note that
  `mail send` is local agent-to-agent messaging under the hub, not an external transmission. A list
  either flag creates starts with `$defaults`, so Claude Code's built-in rules stay in force; an
  existing list is appended to as it is, never given a `$defaults` the user left out. An entry
  already there is a no-op. Each write keeps the file's own indentation (two spaces for a new file)
  and its final newline, and refuses a malformed `autoMode` the same way `--allow-cli` refuses a
  malformed `permissions.allow`. Both flags are claude-only and consent-gated like `--allow-cli`.
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
multiplexer/harness self-diagnosis via `mux doctor` (`mux/`, which also reports the permission rule
read-only); minting the standing owner inbox and
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
| **permission rule** | report the Claude Code allow rules for the CLI's four forms; `--allow-cli` merges in the missing ones, never clobbering a file; claude only |
| **auto-mode entries** | report the force-close rule and the mail note; `--allow-force-close` / `--mark-mail-local` append them after `$defaults`, idempotent, indentation kept; claude only |
| **owner-binding next-step** | emits a bind-owner next-step only when no standing owner exists |
| **idempotent + upgrade** | re-run reports `already present`, rewrites an older cursor generation in place, removes an earlier project hook where the plugin ships it |
