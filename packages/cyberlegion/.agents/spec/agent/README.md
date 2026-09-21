---
spec-type: behavioral
concept: [cyberlegion]
---

# agent — resolve reusable agent definitions

Resolve a universal agent-definition `.md` file (YAML frontmatter + Markdown body, as used under
`.agents/agents/*.md` and `plugins/*/agents/*.md`) into a machine payload or a channel launch command.
`model`/`description`/`effort` are the ordinary agent-def tags; `harness`/`warm`/`interactive` are
cyberlegion-only routing tags a future gateway (`legion-gateway-legate`, CR-5) reads to choose
between a warm peer, an inline run, and a cold subagent. Resolving a def reads a **file only** — no
knowledge of plugin namespacing, SDD, or the def's author; a plugin-scoped def is passed in by
explicit `--agent-file <path>`, never resolved by convention. Authored in `legion-agentdef` (CR-4b).

## Use Cases

**Subject** — turning one named `.md` def into the concrete thing a caller does with it, and the CLI
surface that inspects a def before that:

- **Resolve by name under the project convention** — `agent resolve <name>` (and the internal
  `resolveAgentDef`) searches `.agents/agents/<name>.md` under the project root, parses the leading
  `---`-delimited frontmatter block, and treats everything after it as the def's `instructions`
  body verbatim.
- **Resolve an exact file, bypassing name search entirely** — `--agent-file <path>` (or
  `resolveAgentDef({ file })`) reads that path directly. This is the only way a plugin-scoped def
  (`plugins/<plugin>/agents/*.md`) is ever resolved — cyberlegion never walks a plugin's own
  directory convention itself.
- **Frontmatter tags parse into typed fields** — `name`, `description`, `model`, `effort` (ordinary
  agent-def tags) and `harness` (`claude`|`cursor`|`codex`), `warm`, `interactive` (cyberlegion-only
  routing tags, booleans) are each read off the top-level frontmatter block. A folded `>`/`|` block
  scalar (as `article-writer.md`'s `description` uses) is supported. A tag the def omits resolves to
  `undefined` (or `false` for warm/interactive when unset — a def opts in explicitly) rather than
  raising an error; only a wholly unresolvable name/file raises.
- **A def missing `model` is not an error** — resolution still succeeds; the model field is absent
  and a launch/realize step applies its own harness default rather than the resolver inventing one.
- **realizeLaunch turns a def into a CHANNEL launch invocation** — applies the def's `model` +
  `instructions` (and any `harness`) into the harness's own launch command (`claude`/`cursor-agent`/
  `codex`), for the warm-peer / channel family. An explicit `model`/`harness` override (passed by the
  caller) wins over the def's own tags, which win over the harness default (`claude`). A def's
  `effort` travels through each harness's own effort control, since no two spell it alike: `claude
  --effort <level>`; codex's config override `-c model_reasoning_effort="<level>"` (it has no
  dedicated flag); cursor's bracket parameter on the model, `--model '<model>[effort=<level>]'`,
  merged into any bracket list the model already carries and replacing an `effort=` already there.
  Cursor has no effort control apart from the model, so a cursor def with an `effort` but no `model`
  **throws** rather than launching — a warn-and-ignore would start a session that looks configured
  and runs at the harness default effort, the silent drop this rule exists to prevent. A def with no
  `effort` carries no effort control at all; the harness default applies. This realizes
  the **channel** (warm-peer) launch only; a caller composing a cold Task subagent builds that
  instruction itself from the `resolve` payload (there is no CLI subagent-instruction realizer — the
  result-slot and its instruction builder were dropped in CR-4).
- **agent list / show / resolve / path** — `list` enumerates every resolvable def under
  `.agents/agents/` (name/model/harness rows, a definitive empty state); `show` prints the resolved
  model/effort/harness/warm/interactive plus the instructions body, truncated unless `--full`;
  `resolve` emits the full machine `AgentDef` payload (TOON default, full JSON under
  `--format json`) for a routing caller to compose a launch/spawn from; `path` prints just the
  resolved file path. A bad name/file fails loud (nonzero exit, structured stderr error) rather than
  falling back to a default def.

**Non-goals** — the gateway/Legate routing brain that decides warm-peer vs run-inline vs subagent
from a def's `warm`/`interactive` tags and mux availability (`legion-gateway-legate`, CR-5); actually
spawning anything (`realizeLaunch` is a pure string builder — the CLI never invokes a Task tool or
opens a session itself); building the cold-subagent instruction (a caller composes that from the
`resolve` payload — the CLI has no subagent-instruction realizer since CR-4); plugin/SDD def
discovery conventions (an upward dependency cyberlegion never takes on).

Every scenario in [`agent.feature`](./agent.feature) maps to one of these behaviors:

| Behavior | What it covers |
|---|---|
| **resolve by name** | `.agents/agents/<name>.md` lookup; body becomes instructions |
| **resolve an exact file** | `--agent-file`/`file` bypasses name search; plugin-scoped defs |
| **frontmatter tags parse into typed fields** | model/effort/harness/warm/interactive; folded block scalar; missing tags stay undefined |
| **a def missing model is not an error** | resolution succeeds; harness default applies later |
| **realizeLaunch** | per-harness channel launch command; explicit override precedence; per-harness effort control, cursor's missing-model refusal |
| **agent list / show / resolve / path** | empty state; truncation + `--full`; JSON payload; bad-name fail-loud |
