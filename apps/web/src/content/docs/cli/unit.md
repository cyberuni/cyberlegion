---
title: 'CLI: unit'
description: 'CLI reference for cyberlegion unit: register, discover, spawn, and reap addressable legion units.'
---

```sh
npx cyberlegion unit <register|claim|whoami|who|prune|spawn|close|stop|restart|rebind|show|focus|nudge|read|clear> ...
```

`unit` owns the instance registry and session lifecycle, the middle noun of [the
spine](/cyberlegion/concepts/spine/), a running, addressable agent with its own record and mailbox. It never
decides whether a peer *should* exist for a given task; that judgment is the caller's (or the
[Legate](/cyberlegion/skills/legate/)'s).

## register

```sh
npx cyberlegion unit register [--handle <name>] [--harness <h>] [--standing]
npx cyberlegion unit register --standing --handle <name> --home <dir> (--agent <def> | --harness <h>)
npx cyberlegion unit register --standing --handle <name> --clear-home
```

Register or refresh this session's identity. Bare (with `--standing` and no `--handle`) lists
existing standing agents instead of registering.

| Option | Meaning |
|---|---|
| `--handle <name>` | human handle for this agent |
| `--harness <h>` | `claude` \| `cursor` \| `codex` (else auto-detected); with `--home`, the harness to launch there |
| `--standing` | mint a standing, session-independent owner inbox (bare, with no `--handle`: list them) |
| `--home <dir>` | with `--standing --handle`: the existing folder a presence is spawned in when mail arrives and none is live |
| `--agent <def>` | with `--home`: launch this agent definition, resolved from the home |
| `--clear-home` | with `--standing --handle`: drop the owner's home |

Output: `id`, `handle`, `harness`, `status` (or, for `--standing`, `id`, `handle`, `kind`,
`status`, `home`, and `launch` when a home is set). Warns to stderr if a live session already claims
the requested handle, but still registers.

A **home** lets mail reach a standing owner when nobody is standing in for it. When mail is
delivered and the owner has no live presence, `mail send` spawns a session in the home in its own
workspace, binds it as the presence, accepts the folder's trust prompt, and wakes it to read the
owner's inbox. A home needs exactly one of `--agent` or `--harness`, must already exist, and may not
be the primary checkout of its repository; each of these is checked when you register, and nothing
is written on a refusal. Re-registering without `--home` or `--clear-home` keeps the home and the
bound presence.

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
npx cyberlegion unit spawn --harness <h> [--agent <name> | --agent-file <path>] [--model <name>] [--effort <level>] [--task <text> | --brief-file <path>] [--handle <name>] [--branch <name>] [--worktree-path <path>] [-C, --repo <path>] [--cwd <path>] [--at pane:right|pane:down|tab|workspace] [--no-wake]
```

Launch a new peer session in its own git worktree (tmux or herdr), or into an existing directory
with `--cwd`. Also available as the top-level alias `cyberlegion spawn`.

| Option | Meaning |
|---|---|
| `--harness <h>` | `claude` \| `cursor` \| `codex` (required unless `--agent`/`--agent-file` resolves one) |
| `--agent <name>` | resolve an agent def (`.agents/agents/<name>.md`) for harness/model/effort/instructions |
| `--agent-file <path>` | read an exact agent def file instead of resolving by name |
| `--model <name>` | model for this launch only (flag > agent def > harness default) |
| `--effort <level>` | effort for this launch only (flag > agent def > harness default) |
| `--task <text>` | brief text, or `-` for stdin |
| `--brief-file <path>` | read the brief from a file |
| `--handle <name>` | handle for the new peer |
| `--branch <name>` | branch for the new worktree (default `cyberlegion/unit-<id>`) |
| `--worktree-path <path>` | where to check out the new worktree |
| `-C, --repo <path>` | create the worktree from the git repository containing `<path>`, not the current directory's — spawn for another repository without `cd`; the default `--worktree-path` sits beside that repository's primary checkout |
| `--cwd <path>` | spawn the session in an existing directory; create no worktree (mutually exclusive with `--branch`/`--worktree-path`/`--repo`) |
| `--at <placement>` | where to open the new session: `pane:right` \| `pane:down` \| `tab` \| `workspace` (default: new-worktree → `workspace`, `--cwd` → `tab`); see [Placement](/cyberlegion/concepts/architecture/#placement-is-a-concept-not-a-backend-command) |
| `--no-wake` | suppress the first-turn doorbell (spawn idle; the caller drives the first turn itself) |

`--model` and `--effort` override one launch. The precedence is **flag > agent def > harness
default**: a flag beats the def's own `model`/`effort` tag, and the def's tag beats the harness's own
default. A flag never writes back to the def. The flags also work without a def, on a bare
`--harness`. Each harness spells effort differently, and spawn maps it for you:

| Harness | Effort reaches the session as |
|---|---|
| `claude` | `--effort <level>` |
| `codex` | `-c model_reasoning_effort="<level>"` |
| `cursor` | the flat model id `cursor-agent models` lists for that level, `--model '<model>-<level>'` |

Cursor has no effort flag. `cursor-agent models` lists effort as part of flat model ids, such as
`claude-opus-5-high`, and `cursor-agent` refuses the `<model>[effort=<level>]` form its `--help`
documents. So for a cursor spawn with a model and an effort, spawn runs `cursor-agent models` and
launches `<model>-<level>` when that id is listed. A `--model` that already names the level, such as
`claude-opus-5-high` with `--effort high`, launches as it is. When no such id is listed, or the
listing fails, spawn launches the model without the effort.

`cursor-agent` also refuses an effort on its default model (`auto[effort=high]` is not a model it
accepts). A cursor spawn with an effort but no model, from either the flag or the def, therefore
launches at cursor's default without the effort.

In both cases spawn warns on stderr and reports the effort as `<level> (not applied)`. Pass a
`--model` that `cursor-agent models` lists with the level to apply it.

An agent def's body (its instructions) also reaches each harness in a different way:

| Harness | Instructions reach the session as |
|---|---|
| `claude` | `--append-system-prompt '<body>'` |
| `codex` | `-c developer_instructions="<body>"`, added to codex's own instructions |
| `cursor` | the brief: `cursor-agent` has no flag or config setting for them |

On cursor, spawn writes the instructions in front of the task in the peer's brief file, under an
`## Agent instructions` heading, followed by the task under a `## Brief` heading. The peer
therefore gets them as its first user turn, not as a system prompt. With `--no-wake`, a cursor peer
sees its instructions only once something makes it read the brief.

Spawn also delivers the first turn: it writes the brief and wakes the new peer's pane in the same
act, unless `--no-wake` is passed. Output: `spawned` (id), `handle`, `harness`, `model`, `effort`,
`worktree`, `pane`, `rung`, `trust`. The `model` and `effort` fields report what the session launched with,
from whichever source won, and read `(harness default)` when no source set one. Suggests
`unit read <id>` as a next step.

Before the first turn, spawn answers the harness's folder-trust prompt. A harness opened in a folder
it does not trust waits at that prompt, and its hooks do not run, so the peer would never read its
brief. Spawn reads the new pane until the harness shows the prompt or settles without one. This
happens with `--no-wake` too.

- A spawn that **creates a worktree** accepts the prompt, because the folder is a checkout of the
  caller's own repository. Claude Code and Codex save that trust against the main repository's
  root, so each repository prompts at most once.
- A **`--cwd`** spawn, such as one into a new repository, sends no trust key. A person must answer
  the prompt in the peer's pane.

When the prompt is left showing, either because it was left for a person or because it did not
clear after the accept keys, spawn rings nothing. It names the folder, the harness, and the pane on
stderr, prints the `unit nudge` command that delivers the first turn afterwards, and exits non-zero.
The peer is still registered. The `trust` field reads `none` (no prompt), `accepted`,
`needs-human`, `stuck`, or `unsettled` (the screen never settled, so spawn rang as usual).

## close

```sh
npx cyberlegion unit close <id> [--force] [--keep-worktree]
```

Tear down a unit's worktree and session and reap its state, the inverse of `spawn`. `<id>` may be
a unit id, handle, or worktree branch/CR ref. The reap deletes the unit's record, pane pointer,
brief, and mailbox. `close` is the only destructive way to end a unit: to end just its session and
keep the work, use [`stop`](#stop).

| Option | Meaning |
|---|---|
| `--force` | discard uncommitted changes in the worktree (never overrides refusing the primary checkout) |
| `--keep-worktree` | leave the worktree on disk and reap everything else — record, mailbox, pane, brief (never overrides refusing the primary checkout) |

Output: `closed` (id), `worktree`, `retained`, `pane`.

`--keep-worktree` is for **worktree pools**: after a unit's work merges, keep its checkout, detach
it back to `main`, and spawn the next unit into it with `--cwd` — much cheaper than a fresh checkout
per unit. The retained path is reported as `retained` (and `retainedWorktree` under `--format json`),
and only when a worktree was actually there to keep, so an empty value always means "nothing reusable
here".

Because nothing is deleted, `--keep-worktree` skips the dirty-worktree refusal: that check exists
only to protect uncommitted work from `git worktree remove`. The primary-checkout refusal is *not*
relaxed — it protects the session and record of the checkout you are sitting in, not just its files —
so neither `--force` nor `--keep-worktree` overrides it.

## stop

```sh
npx cyberlegion unit stop <ref>
```

End a unit's session and keep the unit. `stop` tears down the pane and then checks that the
backend no longer lists it. After that it marks the record `stopped`: the record has no pane, but
its id, handle, inbox, brief, worktree, and last-seen time stay as they were. A stopped unit is
never pruned, and it is still addressable by handle, so mail sent to it while it has no session
lands in its inbox.

Output: `stopped` (id), `pane`, `verified`, `already`. `verified: false` means the backend gave no
pane list to check against: the stop is recorded but not confirmed. If the backend still lists the
pane after the teardown, `stop` fails and leaves the record unchanged. It refuses a standing or
service record (it has no runtime) and the caller's own session.

## restart

```sh
npx cyberlegion unit restart <ref> [--no-wake] [--fresh]
```

Give a unit a new session and keep the unit. `restart` first stops a session that is still
running, using the same verified stop. It then opens a new session at the unit's cwd with the
launch command the unit was spawned with (the harness default for older records). It binds the
record to the new pane and rings the session. A unit with a worktree opens in its own workspace.
A `--cwd` unit opens in a tab.

| Option | Meaning |
|---|---|
| `--no-wake` | do not ring the new session; the caller briefs it by mail |
| `--fresh` | start an empty session and rebrief it, even when the conversation could be resumed |

Output: `restarted` (id), `previous` (pane), `pane`, `resumed`, `rung`.

A claude or codex unit resumes its last conversation. The harness's SessionStart hook (the plugin's,
or the one `init` installs) records the harness's session id on the unit each time a session starts
in its pane, and `restart` relaunches with `claude --resume <id>` or `codex resume <id>`. The ring then
tells the session to continue its work. If the harness rejects the id, the plain launch command runs
instead. A cursor unit, a unit with no recorded session, a unit launched through a wrapper command, or
`--fresh` gets an empty session: it is rebriefed from its brief file. Either way its pending mail is
still in its inbox. If the new session cannot be opened, the unit is left `stopped`, and running `restart`
again recovers it. `restart` refuses a unit whose cwd is gone, because that unit needs replacing.

## rebind

```sh
npx cyberlegion unit rebind <ref>
```

Run inside a pane where you started the harness by hand, for example with the harness's own resume
flag. `rebind` binds the unit to that pane, so the session is this unit, with its inbox and brief.
It refuses a pane that another live unit holds, and it refuses a unit that may still be running in
another pane (stop it first).

## show

```sh
npx cyberlegion unit show <ref> [--format json]
```

The read-only runtime view for dashboards and controllers. Output: `id`, `handle`, `harness`,
`status` (as recorded), `liveness` (probed now), `pane`, `cwd`, `worktree`, `lastSeen` (as
recorded), and `controls`. `show` writes nothing, so any number of clients can watch and reconnect
without owning anything, and closing a client leaves every runtime running.

| `liveness` | Meaning |
|---|---|
| `live` | the backend lists the unit's pane |
| `gone` | the backend answered, and the pane is not in its list; the recorded status is left as it was |
| `unknown` | no pane is known, or the backend gave no answer |
| `stopped` / `exited` | read from the record |
| `none` | a standing or service record, which has no runtime |

`controls` is worked out from the record and the probed liveness. It never comes from a pane's
display name. `focus`/`nudge`/`read` appear only when the unit is `live`, and `clear` needs a
harness with an honest reset. `stop` needs a known pane, `restart` a launchable harness and an
existing cwd, and `rebind` a `stopped`, `exited`, or `gone` runtime.

### Backend recovery

| Backend | stop | restart | rebind |
|---|---|---|---|
| tmux | kills the pane, then verifies with the pane list | opens a fresh window at the unit's cwd | from inside a tmux pane |
| herdr | closes the pane, then verifies with the pane list | opens a fresh workspace or tab at the unit's cwd | from inside a herdr pane |
| no multiplexer | no pane to stop; the record is marked stopped | refused, because no backend can open a session | refused, because there is no pane to bind |

A claude or codex unit with a recorded conversation resumes it on restart. Every other restart is
a fresh session plus a rebrief. A unit whose worktree or cwd is gone needs a new unit (`spawn`) and a new brief.

## focus

```sh
npx cyberlegion unit focus <ref>
```

Move input focus to a peer's session.

## nudge

```sh
npx cyberlegion unit nudge <ref> [--message <text>]
```

Ring a peer's session: a doorbell that tells them to check their mail. `<ref>` is a unit id,
handle, or worktree branch/CR ref. `--message` defaults to the standard delivery doorbell text. A
nudge carries no payload of its own. The message the peer is being told to read always lives in
the mailbox. See [Mail Model](/cyberlegion/concepts/mail-model/).

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

- [The Spine](/cyberlegion/concepts/spine/): the agent / unit / pane nouns
- [CLI: mail](/cyberlegion/cli/mail/): the mailbox every registered unit gets
- [CLI: agent](/cyberlegion/cli/agent/): the definitions `--agent` resolves
- [Skill: legate](/cyberlegion/skills/legate/): decides *when* to spawn or close a unit
