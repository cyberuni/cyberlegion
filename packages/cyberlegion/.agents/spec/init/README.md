---
spec-type: behavioral
concept: [cyberlegion]
---

# init — the onboarding front door

One command that gets a project ready to surface Legion mail: resolve this session's harness and
register the SessionStart surfacing hook, then point the human at binding a durable owner inbox. It is
the friendly, auto-detecting entry a human (or the `init-cyberlegion` skill that wraps it) runs once;
the low-level per-harness installer and the hook mechanics themselves live in `surfacing/`.

## Use Cases

**Subject** — a session bootstrapping the Legion surfacing hook into its project without being told
which harness it runs under:

- **init resolves the harness and registers the surfacing hook** — `cyberlegion init [--agent
  claude|cursor|codex] [--dir <path>]` resolves the harness — an explicit `--agent` (validated against
  `claude | cursor | codex`, throwing on anything else) always wins; absent it, the same layered
  harness detection `identity register` uses auto-detects it — and registers the SessionStart hook
  (plus PostToolUse where the harness supports it) into that harness's project-local config under
  `--dir` (default the current directory), through the **same idempotent installer** `admin install`
  drives. It reports each registration as `registered` or `already present`.
- **init auto-detects; admin install stays the explicit low-level verb** — both resolve the harness
  and register through one shared resolver, but `init` adds auto-detection and an owner-binding
  next-step for onboarding, while `surfacing/`'s `admin install` requires an explicit `--agent` and
  installs nothing else. `init` never chooses a harness by guessing: when nothing detects and no
  `--agent` is given, it throws asking for `--agent` rather than picking one.
- **init points at owner binding when none is bound** — after registering, when no standing owner
  inbox exists yet, `init` emits a next-step toward minting and binding the durable owner inbox
  (`identity owner` / `identity bind-main`); when a standing owner already exists it emits no such
  next-step. `init` itself never mints an owner or binds a pane — it only registers the hook and
  advises the binding step (which the human confirms).
- **init is idempotent** — re-running `init` for an already-installed project re-reports `already
  present` for each hook rather than duplicating an entry, exactly as the underlying installer does.

**Non-goals** — the hook payload and the per-harness `admin install`/`admin doctor` mechanics
(`surfacing/`); minting the standing owner inbox and binding the main pane (`identity/`); the
user-facing interactive ask (the `init-cyberlegion` plugin skill that wraps this verb). This node owns
only the auto-detecting hook-registration entry point and its owner-binding advice.

Every scenario in [`init.feature`](./init.feature) maps to one of these behaviors:

| Behavior | What it covers |
|---|---|
| **resolve + register** | auto-detect harness (or `--agent`) and register the SessionStart (+ PostToolUse where supported) hook via the shared installer |
| **auto-detect vs explicit** | `--agent` overrides + is validated; undetectable with no `--agent` throws asking for it, never guesses |
| **owner-binding next-step** | emits a bind-owner next-step only when no standing owner exists |
| **idempotent** | re-run reports `already present`, never a duplicate entry |
