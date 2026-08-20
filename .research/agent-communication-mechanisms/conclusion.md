# Conclusion — agent communication mechanisms

> This is the file other documents cite. Evidence and sources are in
> [evidence.md](./evidence.md); the question and scope are in [topic.md](./topic.md).

## C1. cyberlegion keeps its own substrate. Adopt neither agmsg nor A2A as the base.

Both candidates are single-plane systems. cyberlegion is a two-plane system, and the
second plane is the one that carries authority.

| Plane | Mechanism | Authority |
| --- | --- | --- |
| Mail plane | `message.ts` → `Store.putMessage` → per-agent inbox files | Peer. Non-authoritative by construction. |
| Mux plane | `unit nudge` / `unit clear` → cyber-mux → keystrokes into the peer's pane | User turn. Indistinguishable from the human typing. |

agmsg has only a mail plane. A2A has only a mail plane, and only over the network.
Replacing cyberlegion's substrate with either means **deleting the only authoritative
channel the system has** and rebuilding it.

## C2. Peer mail cannot be made authoritative, and should not be

An agent treating a mail-delivered command as peer communication — and declining to act
until the user says so directly — is correct behavior, not a defect. It is the documented
trust boundary in every harness that has one, and it is the consensus mitigation in the
multi-agent security literature. A transport that granted authority to mail would be a
prompt-injection hole.

The corollary: **stop trying to make the mail plane authoritative.** Model authority
separately.

## C3. Mode coverage

| Mode | cyberlegion | agmsg | A2A |
| --- | --- | --- | --- |
| `spawn` (with brief) | Yes — `session.ts` plus brief-via-hook | Partial — PTY spawn, no brief contract | No — agent lifecycle is out of scope |
| `despawn` | Yes — `decommission.ts` | No | No |
| `peer-message` | Yes | Yes | Yes |
| `order` (authoritative) | Yes — mux plane | No | No |
| conversation (per-turn) | Weak — `wake/await.ts`, 1s poll | Yes — shared log | Yes — SSE stream |

Only per-turn conversation is a genuine weakness, and it is a poll-interval problem, not
an architectural one.

## C4. Why not agmsg

1. **It is a `Store` implementation, not a mechanism.** cyberlegion's `Store` seam already
   sanctions a `SqliteStore` swap in writing, with the explicit guarantee that
   identity/message/runtime code never changes. Adopting agmsg imports a foreign schema to
   obtain a swap that can be done behind an interface already owned.
2. **It discards `session-adapter-governance`.** cyberlegion's ratified verify-effect-or-
   fail-loud rule exists because of a real defect (the cr150 nudge boot-race). agmsg is
   fire-and-forget shell. Adopting it reintroduces the class of defect already fixed.
3. **Three of five modes are unimplemented** — no authority tier, no despawn, no brief
   contract.

## C5. Why not A2A

Every participant must be an HTTP server with an Agent Card, OIDC/JWT auth, and
`/sendMessage` endpoints. A tmux pane running `claude` is not a server. A2A's unit of work
is a Task delegated to a remote service; cyberlegion's is a peer session on the same disk,
in the same worktree. Wrong altitude, wrong trust model, wrong lifecycle. A2A also cannot
express `spawn`, `despawn`, or `order`.

## C6. Decisions

1. **Keep the substrate.** cyberlegion plus cyber-mux. Promote cyber-mux's role in
   doctrine: it is the **authority plane**, not merely a spawner.
2. **Name the two planes explicitly** in `relay-governance`. Mail is peer and never
   authoritative; mux injection is a user turn and is authoritative. The distinction lives
   in the code today and is absent from the governance.
3. **Model authority as a leash granted at spawn.** A peer message then never grants
   power; it only activates power the human already delegated. This matches the existing
   three-layer leash model.
4. **Add an inbound authority classification** to `relay-governance`, which currently
   keys only on the agent's own outbound lifecycle. This is the concrete gap.
5. **Defer the per-turn improvement.** A `SqliteStore` behind the existing seam, or the
   existing `console/doorbell.ts`, buys a real wake channel if the 1s poll is measured to
   hurt. Do not build it speculatively.
6. **A2A only as an outbound edge adapter**, so a unit can call a remote A2A agent. Never
   inbound, never the base. Low priority.

## C7. Recorded risk

The mux plane is authoritative *because* it is unforgeable by mail — but it is forgeable
by any local process that can write to the multiplexer socket. It is authoritative, not
authenticated. This boundary is currently undocumented and must be stated wherever the
mux plane is described as carrying orders.

## C8. Headless caveat

Native Claude Code cross-session messaging degrades under `claude -p`: a headless session
binds an inbox socket and can receive, but cannot show an approval dialog, so held
messages expire after `dialogExpiry` (5 minutes by default) unless started with
`crossSessionInbound: accept`. Bare mode binds no socket at all. Agent teams cannot form
headless. Filesystem transport has none of these failure modes, which is a further
argument for keeping it.
