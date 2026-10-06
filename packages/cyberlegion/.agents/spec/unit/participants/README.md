---
spec-type: behavioral
concept: [cyberlegion]
---

# unit participants — the hub's units mirrored into cynapse

## What

cynapse owns messaging between participants (cynapse
[ADR-0013](https://github.com/cyberuni/cynapse/blob/main/docs/adr/0013-messaging-between-participants.md)).
It holds addresses and read state, and it never measures whether a session is alive. The runtime
that runs the sessions asserts that. This node is stage 1 of moving cyberlegion's messaging onto
cynapse (cyberuni/cyberlegion#153): every unit in the hub is registered as a cynapse participant,
kept `live` while the unit exists, and `retired` when it is gone. Mail still goes through the hub's
own mailboxes; sending through cynapse is stage 2.

**Optional.** cynapse is an optional peer dependency. Cross-package decision
[0001](https://cyber-civitas.github.io/decisions/0001-runtime-depends-on-communication/) says a
runtime-only user never installs it. The CLI loads it with a dynamic import, kept out of the bundled
`dist/cli.mjs`, and every step here is a silent no-op when it cannot be loaded (not installed, or no
`node:sqlite`). A cynapse failure after it loads is reported on stderr and never fails the command.

**The sync.** One idempotent pass reconciles the whole hub against cynapse, so registering,
retiring, renaming and crash recovery are the same act:

| Hub record | Participant |
|---|---|
| a unit that is not `exited` (`stopped` included — it keeps its address) | registered, or revived, `live`, kind `agent`, named by the unit's handle |
| a unit whose handle differs from the participant's name | renamed; cynapse keeps the old handle as an alias |
| a unit that is `exited`, or whose record is gone | retired, if this hub registered it and it is still live |
| a standing owner or a service endpoint | not mirrored — neither is a unit |

The pass runs after `unit register`, `unit spawn` (and `spawn`), `unit close`, `unit prune`,
`unit who --reconcile` (and `who --reconcile`), and `service start`. It runs under the hub lock
`cynapse-participants`, so a concurrent spawn's record and its registration never straddle another
process's retire pass. Because it reconciles everything, a crash that left participants live is
corrected by the next pass.

**Keys.** The hub registers itself as a `service` participant keyed `cyberlegion:hub/<hash of the
hub root>`, and registers each unit keyed `cyberlegion:unit/<unit id>` with itself as
`registeredBy`. A hub retires only the participants it registered, so two hubs (a `--space`, say)
sharing one cynapse store never retire each other's units. The store is the one `$CYNAPSE_HOME`
names, and a spawned unit inherits that variable.

**The repository's native ID.** cynapse keys a repository's channel by its hosting store's ID and
never calls a store itself. `project register` and `project show` resolve the `origin` remote's
GitHub node id (`gh repo view <remote> --json id`), record it on the project once, and look up the
channel cynapse keys by it. cyberlegion passes the store and the ID and never spells the key. It
owns no address channel, so it only looks the channel up and never creates one. Without cynapse,
`gh` is never called.

**Non-goals.**

- **Sending through cynapse** (stage 2) and retiring the hub's mailboxes (stage 3, blocked on
  cyberuni/cynapse#60).
- **Waking from cynapse's change token.** The doorbell still rings on hub mail.
- **Binding a role to a session.** Which session acts as a durable owner is the consumer's claim.

## Use Cases

| Actor | Goal | Entry point |
|---|---|---|
| a unit, a spawner | the unit is addressable in cynapse while it exists | `unit register`, `unit spawn` |
| a spawner | a closed or dead unit stops resolving in cynapse | `unit close`, `unit prune` |
| a unit | a new handle resolves in cynapse | `unit register --handle` |
| a runtime-only user | cyberlegion works with no cynapse installed | any command |
| a project's peer | find the channel cynapse keys by the repository | `project show` |
