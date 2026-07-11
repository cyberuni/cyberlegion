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
  same layered harness detection `unit register` uses auto-detects it — and registers the SessionStart
  hook (plus PostToolUse where the harness supports it) into that harness's project-local config under
  `--dir` (default the current directory), through the shared idempotent installer. The registered
  command is the **npx** form — `npx cyberlegion@<version> mail hook --event <event>` when `--pin`
  supplies the project's declared version (the version is **injected**, not read from the running
  binary, so it matches the bundled plugin's pin), or the unpinned `npx cyberlegion mail hook
  --event <event>` when no `--pin` is given. It reports each registration as `registered` or
  `already present`.
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
  Matching is by the dedicated `mail hook --event <event>` command, not the exact string, so an
  existing **legacy bare** `cyberlegion mail hook …` entry is **rewritten in place** to the npx form
  rather than duplicated.

**Non-goals** — the hook injection payload and owner-mail surfacing gate (`mail/surface`);
multiplexer/harness self-diagnosis via `mux doctor` (`mux/`); minting the standing owner inbox and
binding the main pane (`unit/registry` / `attach/`); the user-facing interactive ask (the
`init-cyberlegion` plugin skill that wraps this verb). This node owns only the auto-detecting
hook-registration entry point and its owner-binding advice — plus, pending CR-2 resolution #2, the
low-level per-harness installer it will absorb (see the TODO above).

Every scenario in [`init.feature`](./init.feature) maps to one of these behaviors:

| Behavior | What it covers |
|---|---|
| **resolve + register** | auto-detect harness (or `--agent`) and register the SessionStart (+ PostToolUse where supported) hook via the shared installer |
| **auto-detect vs explicit** | `--agent` overrides + is validated; undetectable with no `--agent` throws asking for it, never guesses |
| **owner-binding next-step** | emits a bind-owner next-step only when no standing owner exists |
| **idempotent** | re-run reports `already present`, never a duplicate entry |
