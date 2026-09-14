---
title: 'CLI: service'
description: 'CLI reference for cyberlegion service: resolve-or-start one authoritative owner per project service, hand it off, and fence out stale owners.'
---

```sh
npx cyberlegion service <resolve|acquire|bind|release|handoff|verify|start> <project> <name> ...
```

A service is a named role in a [registered project](/cyberlegion/cli/project/) that exactly one
unit owns at a time. `<project>` accepts anything `project show` accepts. `<name>` is a lowercase
token (letters, digits, `-`, `_`).

A service has two parts:

- The **endpoint** is a session-independent record with a durable mailbox. Its id is the service's
  stable reference, and it outlives every owner. Prune never reaps it and `unit close` refuses it.
- The **lease** records the owning unit and a **generation**. The generation increases on every
  change of authority, so a runtime holding an older generation is stale.

The design and its trade-offs are recorded in [ADR-0033](https://github.com/cyberuni/cyberlegion/blob/main/docs/adr/0033-project-services-fenced-ownership.md).

## Output

Every verb emits the service state: `project`, `service`, `endpoint`, `generation`, `state`
(`vacant`, `reserved`, `active`), `holder`, `health`, and `control`, plus a `note` when there is a
qualification to report. `health` is one of:

| Health | Meaning |
|---|---|
| `vacant` | no owner and no start in progress |
| `starting` | a reservation is held and has not expired |
| `expired` | a reservation expired without an owner; the next acquire takes over |
| `healthy` | the owner's session is there, or cannot be ruled out |
| `unhealthy` | the owner's record is missing or exited, or its pane is gone |

`control` is `pane` when the owner has a multiplexer pane that `unit focus|nudge|read` can reach, and
`none` otherwise. An owner with no pane (for example, a native subagent that only its parent can
drive) still resolves, but the note says its control is not recoverable. A resolved address never
implies control.

## start

```sh
npx cyberlegion service start <project> <name> [spawn options] [--ttl <ms>]
```

Resolve-or-start in one command. It takes every [`unit spawn`](/cyberlegion/cli/unit/) option. If the
service has a healthy owner, it reports `outcome: resolved` and spawns nothing. If another caller is
starting it, it reports `outcome: starting`. Otherwise this caller holds the reservation: it spawns
one peer, binds it as the owner, and reports `outcome: started`. When the spawn fails, the
reservation is released so a retry can start immediately. Concurrent `start` calls spawn at most one
peer.

## acquire

```sh
npx cyberlegion service acquire <project> <name> [--ttl <ms>] [--force-generation <n>]
```

The first half of a start you drive yourself. Reports `outcome`:

- `resolved`: a healthy owner exists.
- `starting`: another caller holds an unexpired reservation.
- `reserved`: this caller holds the reservation. The output adds `token` and `expiresAt`. Start the
  runtime, then run `service bind` before `expiresAt` (default five minutes; set it with `--ttl`).

Exactly one of any number of concurrent callers gets `reserved`. A vacant service, an unhealthy
owner, and an expired reservation are all reservable, each under a new generation.

`--force-generation <n>` reserves even over a healthy owner or an unexpired reservation. It must
name the current generation, so a force based on a stale read fails.

## bind

```sh
npx cyberlegion service bind <project> <name> --generation <n> --token <token> [--unit <ref>]
```

Make a live unit the owner at the reserved generation (default: this session). Fails as stale when
the reservation is no longer current, for example when it expired and another caller re-reserved.
In that case the runtime you started is not the owner and should be stopped.

## release

```sh
npx cyberlegion service release <project> <name> --generation <n> [--token <token> | --unit <ref>]
```

With `--token`, abandon a reservation after a failed start. Without it, step down as the owner
(default unit: this session). Either form must match the current generation.

## handoff

```sh
npx cyberlegion service handoff <project> <name> --generation <n> --to <ref> [--from <ref>]
```

Transfer ownership from the current owner (default: this session) to another live unit, under a new
generation. Only the owner at the current generation can hand off. Afterwards the previous owner
fails `verify`.

## verify

```sh
npx cyberlegion service verify <project> <name> --generation <n> [--unit <ref>]
```

The fencing check. Exits `0` only when the unit (default: this session) owns the service at exactly
`<n>`. Run it before acting as the service's authority. A runtime that was replaced, handed off, or
recovered past exits non-zero. A runtime learns its generation from `service resolve`, where
`holder` is its own id.

## resolve

```sh
npx cyberlegion service resolve <project> <name>
```

Read the service state without changing anything. Fails for a service that was never acquired.

## Service mail

Send to the service with `mail send --to <endpoint>`, and read it as the owner with `mail inbox
--owner <endpoint>`. The mail stays pending while owners change. Sending to an endpoint does not
ring the owner's pane yet.

## Related

- [CLI: project](/cyberlegion/cli/project/): registering the project a service belongs to
- [CLI: mail](/cyberlegion/cli/mail/): reading the endpoint's mailbox with `--owner`
- [CLI: unit](/cyberlegion/cli/unit/): the spawn options `service start` accepts
