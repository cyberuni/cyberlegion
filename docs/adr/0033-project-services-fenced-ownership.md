# ADR-0033: Project services own one authoritative runtime through a fenced lease

## Status

Accepted

## Context

cyberuni/cyberlegion#6. A standing inbox is a durable address, and `unit claim` binds a live unit
to it, but a claim is last-writer-wins: any session can replace the presence, and nothing tells a
replaced session that it is no longer the one in charge. That cannot represent one authoritative
controller per project that other sessions only contact. Downstream consumers (cyberfleet's
per-project coordinator, cyberuni/cyberfleet#25) need to resolve-or-start that controller exactly
once under concurrency, recover it when it dies, and hand it off, without a stale runtime acting as
the current one.

The CLI stays mechanism: the primitives use neutral vocabulary (project, service, owner), and the
policy of which service exists and where its runtime lives stays with the consumer.

## Decision

### 1. A project is keyed by its git common dir

`project register` derives the project id from a hash of the realpath'd `git rev-parse
--git-common-dir`. Every checkout of a repository (the default checkout and each linked worktree)
reports the same common dir, so all of them resolve to one project. Two unrelated repositories that
share a directory name have different common dirs and different ids. The id is deterministic, so
concurrent registrations from two worktrees converge without a lock. The directory basename is kept
only as a display name; resolving by name fails loud when it is ambiguous.

*Revisitable cheaply:* moving a repository changes its common dir and so its id. Registering it again
creates a new project. A move-stable id (for example, one minted and stored inside the common dir)
can replace the derivation later without changing the service model.

### 2. A service splits into an endpoint and a lease

- The **endpoint** is an `AgentRecord` with `kind: 'service'` and a deterministic id
  (`svc-<project>-<name>`). Its mailbox and id are the service's stable reference. It has no session.
  Prune and reconcile skip it, `unit close` refuses it, and it is not surfaced as owner mail, so its
  pending mail survives every owner.
- The **lease** (`services/<project>/<name>.json`) records the state (`vacant`, `reserved`,
  `active`), the holder unit, and a **generation**. Every change of authority bumps the generation:
  a new reservation or a handoff. It is persisted apart from any runtime.

*Load-bearing:* the endpoint and lease layout and the generation semantics are what consumers build
fencing on.

### 3. Resolve-or-start is reserve, then bind

A lock may be held only for a bounded wait (`store/lock.ts`), and launching a runtime takes longer
than that. So `acquireService` runs under the service's named lock and either:

- resolves a healthy owner (`resolved`),
- reports an unexpired reservation (`starting`), or
- writes a time-bounded reservation with a token under a new generation (`reserved`).

Exactly one concurrent caller gets `reserved`. That caller launches the runtime and calls
`bindService` with the generation and token. A start that throws releases its reservation; a start
that dies leaves a reservation that expires, and the next acquire takes over under a new
generation. The late starter's bind is then refused as stale, so a slow start cannot produce a
second authority. `startService` composes the three steps around an injected launcher, and the CLI's
`service start` passes `spawnAndWake` as that launcher.

### 4. A healthy owner is never displaced silently

An owner is unhealthy only when its record is missing or `exited`, or when its multiplexer reports
its pane gone. A pane-less owner cannot be probed and reads as live. This is the same fail-closed
policy the lock applies to an ambiguous holder. Such an owner is recovered after `unit prune` marks it
exited, or by an explicit `--force-generation <n>`. The force must name the current generation, so a
force decided on a stale read fails instead of displacing an owner the caller never saw.

### 5. Fencing is a generation check

`verifyOwnership` (`service verify`) succeeds only for the holder at the current generation.
`withOwnership` runs a short critical section under the service lock after that check, so no
transition can interleave. Handoff (`service handoff`) is allowed only from the holder at the
current generation, to a live unit.

### 6. Resolving an address never implies control

A resolved service reports `control: pane` only when the owner has a multiplexer pane. Otherwise it
reports `control: none` with a note that its session control is not recoverable from here (for
example, a native subagent that only its parent can drive).

## Consequences

- Wake delivery for service mail is not routed to the owner yet. Sending to an endpoint rings
  nothing, and the owner reads the endpoint with `mail inbox --owner <endpoint>`. Binding delivery
  and hook surfacing to service participation is cyberuni/cyberlegion#7.
- Stop, restart, and rebind of a runtime that keeps its identity is cyberuni/cyberlegion#8. This ADR
  covers replacement through acquire and bind, and handoff.
- Fencing protects only resources whose writers check the generation. The filesystem hub has no way
  to fence an arbitrary side effect a stale runtime performs without checking.
