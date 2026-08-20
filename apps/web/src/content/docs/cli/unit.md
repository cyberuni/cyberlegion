---
title: 'CLI: unit'
description: 'CLI reference for cyberlegion unit: register, discover, spawn, and reap addressable legion units.'
---

```sh
npx cyberlegion unit <register|claim|whoami|who|prune|spawn|close|focus|nudge|read|clear> ...
```

`unit` owns the instance registry and session lifecycle — the middle noun of [the
spine](/concepts/spine/), a running, addressable agent with its own record and mailbox. It never
decides whether a peer *should* exist for a given task; that judgment is the caller's (or the
[Legate](/skills/legate/)'s).

## register

```sh
npx cyberlegion unit register [--handle <name>] [--harness <h>] [--standing]
```

Register or refresh this session's identity. Bare (with `--standing` and no `--handle`) lists
existing standing agents instead of registering.

| Option | Meaning |
|---|---|
| `--handle <name>` | human handle for this agent |
| `--harness <h>` | `claude` \| `cursor` \| `codex` (else auto-detected) |
| `--standing` | mint a standing, session-independent owner inbox (bare, with no `--handle`: list them) |

Output: `id`, `handle`, `harness`, `status` (or, for `--standing`, `id`, `handle`, `kind`,
`status`). Warns to stderr if a live session already claims the requested handle, but still
registers.

## claim

```sh
npx cyberlegion unit claim <handle> [--clear] [--show]
```

Bind the caller's unit as a standing owner's presence.

| Option | Meaning |
|---|---|
| `--clear` | unbind the presence (a no-op when nothing is bound) |
| `--show` | print the bound presence instead of claiming |

## whoami

```sh
npx cyberlegion unit whoami
```

Print this session's own identity (`id`, `handle`, `harness`, `status`). Fails if the session has
no identity yet.

## who

```sh
npx cyberlegion unit who [--all] [--reconcile]
```

List the addressable units. Also available as the top-level alias `cyberlegion who`.

| Option | Meaning |
|---|---|
| `--all` | include exited units |
| `--reconcile` | live-probe the current mux: cull dead-pane records and adopt unbound harness-bearing panes before listing |

Output: a `units` table (`id`, `handle`, `harness`, `status`, `pane`). Suggests `unit register` as
a next step when the list is empty.

## prune

```sh
npx cyberlegion unit prune
```

Mark dead units exited and sweep. Output: a `pruned` table (`id`, `handle`).

## spawn

```sh
npx cyberlegion unit spawn --harness <h> [--agent <name> | --agent-file <path>] [--task <text> | --brief-file <path>] [--handle <name>] [--branch <name>] [--worktree-path <path>] [--cwd <path>] [--at pane:right|pane:down|tab|workspace] [--no-wake]
```

Launch a new peer session in its own git worktree (tmux or herdr), or into an existing directory
with `--cwd`. Also available as the top-level alias `cyberlegion spawn`.

| Option | Meaning |
|---|---|
| `--harness <h>` | `claude` \| `cursor` \| `codex` (required unless `--agent`/`--agent-file` resolves one) |
| `--agent <name>` | resolve an agent def (`.agents/agents/<name>.md`) for harness/model/instructions |
| `--agent-file <path>` | read an exact agent def file instead of resolving by name |
| `--task <text>` | brief text, or `-` for stdin |
| `--brief-file <path>` | read the brief from a file |
| `--handle <name>` | handle for the new peer |
| `--branch <name>` | branch for the new worktree (default `cyberlegion/unit-<id>`) |
| `--worktree-path <path>` | where to check out the new worktree |
| `--cwd <path>` | spawn the session in an existing directory; create no worktree (mutually exclusive with `--branch`/`--worktree-path`) |
| `--at <placement>` | where to open the new session: `pane:right` \| `pane:down` \| `tab` \| `workspace` (default: new-worktree → `workspace`, `--cwd` → `tab`) — see [Placement](/concepts/architecture/#placement--a-concept-not-a-backend-command) |
| `--no-wake` | suppress the first-turn doorbell (spawn idle; the caller drives the first turn itself) |

Spawn also delivers the first turn: it writes the brief and wakes the new peer's pane in the same
act, unless `--no-wake` is passed. Output: `spawned` (id), `handle`, `harness`, `worktree`, `pane`,
`rung`. Suggests `unit read <id>` as a next step.

## close

```sh
npx cyberlegion unit close <id> [--force]
```

Tear down a unit's worktree and session and reap its state — the inverse of `spawn`. `<id>` may be
a unit id, handle, or worktree branch/CR ref.

| Option | Meaning |
|---|---|
| `--force` | discard uncommitted changes in the worktree (never overrides refusing the primary checkout) |

## focus

```sh
npx cyberlegion unit focus <ref>
```

Move input focus to a peer's session.

## nudge

```sh
npx cyberlegion unit nudge <ref> [--message <text>]
```

Ring a peer's session — a doorbell that tells them to check their mail. `<ref>` is a unit id,
handle, or worktree branch/CR ref. `--message` defaults to the standard delivery doorbell text. A
nudge carries no payload of its own — the message the peer is being told to read always lives in
the mailbox. See [Mail Model](/concepts/mail-model/).

## read

```sh
npx cyberlegion unit read <ref> [--lines <n>]
```

Scrape a peer's session screen. `--lines <n>` caps the trailing lines captured.

## clear

```sh
npx cyberlegion unit clear <ref>
```

Reset a warm peer's context to cold by injecting its own harness's fresh-context command. Keeps
the pane/session warm; tears down nothing. Output: `cleared` (ref), `pane`, `command` (the
injected command).

## Related

- [The Spine](/concepts/spine/) — the agent / unit / pane nouns
- [CLI: mail](/cli/mail/) — the mailbox every registered unit gets
- [CLI: agent](/cli/agent/) — the definitions `--agent` resolves
- [Skill: legate](/skills/legate/) — decides *when* to spawn or close a unit
