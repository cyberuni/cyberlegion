---
spec-type: behavioral
concept: [cyberlegion]
---

# dispatch — result-slot primitives

Delegate work and await a result, without the CLI ever deciding *how* — the routing brain (the
Legate, `legion-gateway-legate`, CR-5) picks warm-peer vs cold-subagent vs run-inline and composes
these primitives; the CLI itself never auto-selects a backend and never invokes a harness Task tool.
Authored in `legion-dispatch-primitives` (CR-3).

## Use Cases

**Subject** — allocating a dispatch's brief + result slot, and reading its result back through
whichever of two distinct result channels applies:

- **`prep` allocates and returns an envelope — it spawns nothing.** `dispatch prep [--agent <name> |
  --agent-file <path>] [--role <r>] (--brief-text <text> | --brief-file <f|->) [--verdict-schema
  <path>] [--thread <id>]` mints a dispatch id (thread defaults to it), writes the brief text into
  the Store, computes the result-file path, and builds an `instruction` string — from a resolved
  agent def's `realizeSubagentInstruction` when `--agent`/`--agent-file` is given, else a generic
  instruction naming the brief and result paths (folding in `--role` when given). It creates no
  session, registers no agent, and never touches a Task tool — the envelope `{ id, thread, briefFile,
  resultFile, instruction }` is handed to whatever spawns next.
- **Two result channels exist and are never conflated.** The **SUBAGENT path**'s result channel is a
  **result file**: the parent invokes its own harness Task tool with `prep`'s `instruction` (the
  Task's blocking IS the wait), the subagent writes its result JSON to `resultFile`, and the parent
  reads it back with `dispatch collect`. The **CHANNEL path**'s result channel is **mail on the
  thread**: an async peer sends `mail send --thread <id>`, and the caller retrieves it via `mail
  await --thread <id>` or `dispatch channel --wait`.
- **`dispatch collect <id>` reads + validates the subagent path's result file.** It is the subagent
  path's counterpart to `mail await`: it reads the JSON the subagent wrote to `resultFile` (via the
  Store, never raw `fs`), validates it against an optional `--verdict-schema`, and prints the
  `DispatchResult` (`{ id, verdict?, body, ts }`). Reading before the file exists is a clear error
  ("no result written yet"), never an empty/default pass.
- **A result failing the verdict schema is an error, not a pass.** `--verdict-schema <path>` names a
  minimal JSON-shape check (required top-level keys + a primitive `type` per key — deliberately not a
  full JSON-Schema implementation). Invalid JSON, an unreadable/invalid schema file, a missing
  required key, or a type mismatch are all reported as errors on both `dispatch collect` and
  `dispatch channel --wait`; the result is never silently accepted.
- **`dispatch channel` is the one CLI-driven convenience — the channel path only.** `dispatch channel
  --agent <name> [--agent-file <path>] (--brief-text <text> | --brief-file <f|->) [--verdict-schema
  <path>] [--at <placement>] [--wait]` runs `prep`, resolves the same agent def's `realizeLaunch`,
  and `session spawn`s a real peer session with that realized launch so the peer's own SessionStart
  hook surfaces the brief. Without `--wait` it returns the envelope (the peer is spawned; the caller
  awaits later, e.g. via `mail await`). With `--wait` it blocks for the mail-thread reply
  (`awaitReply`) and returns the validated `DispatchResult`.
- **`channel` errors without a multiplexer rather than silently degrading.** A channel peer is a real
  harness process in its own pane — `session spawn`'s own backend selection is what surfaces the
  error ("spawn requires a session backend") when no tmux/herdr multiplexer is available; `dispatch
  channel` never falls back to an in-process run or a different backend on its own.
- **The CLI never auto-selects a backend and never invokes Task.** No `dispatch` verb accepts a
  `--backend auto`, spawns a subprocess to run a headless harness, or calls a harness's own Task tool
  — that judgment belongs entirely to the caller (a routing brain, or a human).
- **`session spawn --agent <name>` composes an agent def into the existing spawn primitive.** Passing
  `--agent`/`--agent-file` resolves the def and realizes its launch (harness/model/instructions) in
  place of the plain per-harness default command; an explicit `--harness` still overrides the def's
  own tag.

**Non-goals** — the Legate/gateway routing brain that decides which path to take
(`legion-gateway-legate`, CR-5); a full JSON-Schema validator (the verdict check is deliberately
minimal); retrying or polling a `--wait` channel call across process boundaries (that re-arm pattern
belongs to `mail await`, already shipped in `wake/`).

Every scenario in [`dispatch.feature`](./dispatch.feature) maps to one of these behaviors:

| Behavior | What it covers |
|---|---|
| **prep allocates and returns an envelope** | id/thread minting; brief write; result-slot path; instruction from a def or generic; spawns nothing |
| **two result channels, never conflated** | subagent path = result file; channel path = mail on the thread |
| **collect reads + validates the result file** | reads via the Store; missing-file error; schema validation |
| **a schema failure is an error, not a pass** | invalid JSON; bad schema file; missing required key; type mismatch |
| **channel is the one CLI-driven convenience** | prep + realizeLaunch + session spawn; --wait vs envelope-only |
| **channel errors without a mux** | no silent degrade to run-inline or a different backend |
| **the CLI never auto-selects a backend or invokes Task** | no --backend auto; no subprocess harness invocation |
| **session spawn composes an agent def** | --agent/--agent-file realize harness/model/instructions; explicit --harness still overrides |
