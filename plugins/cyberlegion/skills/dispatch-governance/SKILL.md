---
name: dispatch-governance
description: "Internal skill: the Legate's routing brain — given an intent to fulfill a role with a brief (and an expected verdict), resolves the agent definition's warm/interactive tags and the environment's multiplexer, picks exactly one of the subagent | channel | run-inline strategies, and executes it with the cyberlegion CLI primitives. Loaded in-session by the legate gateway on a dispatch intent, and by the headless-legate agent headless. Not triggered by users directly."
user-invocable: false
---

# Dispatch Governance

The judgment the `cyberlegion` CLI deliberately does not carry. The CLI is dumb hands — it never
auto-routes, never picks a backend, never invokes a Task tool itself. This governance is the one
place that judgment lives, loaded in-session by the `legate` gateway on a dispatch intent, and
realized headless by the `headless-legate` agent. Both loads run the exact same procedure below.

**Input:** an intent to fulfill role `R` with brief `B`, optionally expecting a result that
satisfies verdict schema `V`.

## 1. Resolve the agent definition

```bash
npx cyberlegion@<version> agent resolve <R> --format json
```

Read `model`, `effort`, `harness`, `warm`, `interactive` off the resolved def. `warm` marks a role
that should run as a live peer session (not a fire-and-forget unit); `interactive` marks a role that
may need to grill the caller or converse over multiple rounds, not just return one result.

## 2. Probe the environment

```bash
npx cyberlegion@<version> mux doctor --format json
```

Read whether a multiplexer was ancestry-discovered (tmux/herdr) — a **channel** strategy needs one
to open a pane in; its absence rules that strategy out regardless of what the agent def wants.

## 3. Pick exactly one strategy

| `warm` | `interactive` | mux present | Strategy |
|---|---|---|---|
| true | true | true | **channel** |
| true | true | false | **run-inline** |
| false or true | false | — | **subagent** |

- **channel** — warm, interactive, and a pane is available: spin up a live peer that can converse
  and mail back over rounds. Compose the primitives directly — no single CLI command does this:

  mint a thread id, weave it (and an instruction to reply on it) into brief `B`, then:

  ```bash
  npx cyberlegion@<version> unit spawn --agent <R> --brief-file <B> --at <placement>
  npx cyberlegion@<version> mail await --thread <the-minted-thread-id> [--timeout <ms>] [--max-wait <s>]
  ```

  `unit spawn` launches the peer (its brief tells it what thread to reply on); `mail await` then
  blocks on that reply thread. Use `--at` to place the pane, `--timeout`/`--max-wait` to bound the
  wait; a `waiting` outcome at `--max-wait` means re-run `mail await` on the same thread to keep
  polling, not a failure.

  **The wake-matrix decision** (which sub-mode of channel to run) belongs here too, since the CLI
  carries no `selectWakePath` helper of its own:

  | Environment | Wake mode |
  |---|---|
  | Portable default (mux unknown, or nothing verified) | Bounded await — poll `mail await` with `--max-wait`, re-arming on `waiting` ("A-loop"). |
  | Claude Code, with an observable background task | Bounded await plus a background-task check-in ("A-prime") — same polling, but the harness's own background-task surface can short-circuit a wait. |
  | A live foreign session behind a **verified** multiplexer (`mux doctor` reports tmux/herdr, not `none`) | Doorbell — `unit nudge` the peer's pane, then `mail await` ("B"). |
  | Multiplexer is `none` | **Never** pick doorbell (B) — there is no pane to ring. Fall back to bounded await (A). |

- **run-inline** — the role is warm and interactive (needs a live back-and-forth), but there is no
  multiplexer to host a peer in. **Do not delegate.** Return a `run-inline` verdict and let the
  caller (the session that loaded this governance — e.g. the SDD conductor) do the work itself,
  in-session. A cold subagent is the wrong substitute here: it cold-reloads its whole context every
  round and holds no user channel, so a role that needs to converse cannot be served that way.

- **subagent** — the role is cold and one-shot (no live conversation expected, one result back).
  Realize it via `subagent-backend-governance`: resolve the agent def → the caller's **own** harness
  Task/subagent tool → the subagent's Task-result (its own final returned message) is the verdict.
  The CLI cannot invoke a Task tool itself — that is always the caller's own tool, never
  `cyberlegion`'s — and it collects nothing on the caller's behalf; there is no result file.

The CLI never chooses between these on its own — `unit spawn` + `mail await` only run in this
sequence when this governance picked **channel**; the caller's Task tool only runs when it picked
**subagent**; picking **run-inline** means neither runs at all.

## The `subagent | channel` seam

This is the seam a dependent (e.g. SDD, ADR-0023) references **by intent** — "dispatch a role
fulfillment and expect a verdict" — never by pinning `subagent` or `channel` as a literal command
name. The dependent states its intent (role, brief, verdict schema) and this governance decides the
mechanism; a dependent that hardcodes "always subagent" or "always channel" has broken the seam and
coupled itself to a mechanism instead of an intent.

## Result shape — DispatchResult

Every strategy resolves to one shape the caller can handle uniformly:

```jsonc
{
  "strategy": "subagent" | "channel" | "run-inline",
  "id": "<unit id, when one was spawned>",       // omitted for run-inline
  "verdict": "matched" | "waiting" | "timed-out" | "run-inline",
  "result": { /* the subagent's Task-result, or the mail-await reply body, as-is */ },
  "needsInput": ["<question>", "..."]   // present only when the callee could not complete
}
```

`result` is carried through unvalidated today — structured verdict-schema checking against `V` is a
deferred capability (`mail --verdict-schema`), not present in this CLI.

`waiting` (channel path, `--max-wait` cap hit) and `timed-out` (channel path, `--timeout` elapsed)
are re-armable and terminal respectively — treat them the same way `mail await`'s own three
outcomes are treated; never silently retry past a `timed-out`. A `needsInput` result on the subagent
path means the unit hit its own leash and returned a needs-input result rather than guessing.

**How you relay that `needsInput` (or your own) is `relay-governance`, not this skill.** Report/ask
transport is keyed on the reporting agent's own lifecycle — a framed callee returns `needsInput` to
its caller; a bare cron session with no frame pushes mail to the standing owner and exits. Load
`relay-governance` for the fork; this skill owns **strategy** choice (channel / run-inline /
subagent), relay owns how the result or an unanswerable question gets home.

## Non-goals

- **No auto-routing in the CLI.** The CLI carries no `dispatch` command group at all — `unit spawn`,
  `mail await`, `unit nudge`, and the caller's own Task tool are invoked deliberately by this
  governance (or `subagent-backend-governance`), never by a `--backend auto` flag — no such flag
  exists.
- **No mid-flight strategy switch.** Once a strategy is picked for one dispatch, it runs to its one
  of the three outcomes above; a failed subagent is not silently retried as a channel.
