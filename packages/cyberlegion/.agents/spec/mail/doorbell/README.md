---
spec-type: behavioral
concept: [cyberlegion]
---

# mail doorbell — wake the recipient on delivery

The **push** counterpart to [`mail/surface`](../surface/README.md)'s **pull**. `mail send` durably
delivers a message; the doorbell rings the recipient on arrival so a working recipient checks its
inbox without the sender separately running `unit nudge`. One primitive, three recipient shapes: a
peer agent's live session pane; a **standing owner** with a **presence** bound (`unit claim`), rung at
that live unit's pane; or a standing owner with none, rung at the hub's **bound main pane**
(`attach`), the human's live presence. Added by CR github-159 —
both gaps it closes (a peer never woken; the human never notified on live arrival) are the same
missing primitive, differing only in recipient.

## Use Cases

**Subject** — waking the recipient of a just-delivered message so it checks its inbox, without
turning the durable send into something that can fail because no one was awake:

- **A peer recipient with a live pane is rung on delivery** — after `mail send --to <peer>` writes the
  message, the recipient's live session pane is rung with a check-your-inbox doorbell so a working
  ship reads the mail with no separate manual `unit nudge`. The ring goes through the same
  `unit/lifecycle` **submit-verify** path the standalone nudge uses (issue #150): it is delivered as a
  **taken turn** — read the pane back, flush the staged buffer if a booting harness swallowed the
  first submit, never re-typing so the doorbell lands exactly once — not fire-and-forget. The sender's
  own pane is never rung (a send whose recipient resolves to the sender's own session delivers no
  doorbell to itself).
- **The wake never fails the send** — durable delivery is the guaranteed effect; the doorbell is
  best-effort on top. A recipient with **no live pane** (headless/absent) is a legitimate no-op: the
  message still lands, the send succeeds, and it surfaces on the recipient's next SessionStart via the
  existing pull path (`mail/surface`). A ring that **never completes** (a live pane that keeps the
  doorbell staged past the retry cap) is reported as a best-effort warning, never a send error — the
  message still lands. Mail stays store-and-forward; the nudge is the opportunistic wake on top.
- **A standing owner recipient is notified at the bound main pane** — when the recipient is a
  **standing owner** (`kind: standing`, no session pane of its own), the doorbell rings the hub's
  **bound main pane** (`attach`) instead — the human's live presence — so an owner report reaches the
  human proactively on arrival, not only when an agent next fires the surfacing hook and chooses to
  relay it. With **no main pane bound** the ring is the same store-and-forward no-op: the message
  lands durably and surfaces on the next SessionStart.
- **A standing owner with a bound presence is rung at that presence, never focus-gated** — when the
  standing owner has a **presence** bound (`unit claim` — the live unit standing in for it), the
  doorbell rings **that unit's pane** instead of the bound main pane, and rings it **regardless of
  focus**. This is not a new rule but the existing **peer** rule reaching its proper subject: a
  presence is an agent expected to take the turn, not a human whose attention is the scarce resource,
  so the focus gate — which exists to protect *human* attention — does not apply to it. It must not:
  the whole value of a presence is that it acts on a delivery while the human is away, which is
  exactly when a focus gate would suppress the ring. The presence is resolved **live**: a presence
  whose unit has exited is no presence at all, and the ring falls back to the bound main pane rather
  than ringing a corpse.
- **The standing-owner ring gates on the bound main pane being focused** — with **no presence bound**,
  the ring falls back to the human's read-pane, and there the focus gate applies exactly as before.
  The bound main pane is the
  human's live presence, but the human roams (moving to another pane), so a ring to a pane
  no one is watching wakes a session nobody sees and burns tokens. Before ringing the standing-owner's
  bound main pane, ask the mux whether that pane is **currently focused** (on screen for an attached
  client — `mux`'s focus primitive). When it is **positively not focused**, the ring is skipped: the
  report stays queued in the durable owner inbox and surfaces on that pane's next SessionStart pull
  (`mail/surface`), so nothing is lost. When it **is** focused — or when the backend **cannot report
  focus** (`unknown`) — the ring proceeds as before: the gate **fails open**, so a mux that can't
  answer never regresses to silence. This gate applies **only** to the standing-owner ring; a **peer**
  recipient's live pane is rung regardless of focus (a peer is an agent expected to take the turn, not
  a human whose attention is the scarce resource). Probing focus is best-effort inside the same wake
  path — any probe error is treated as `unknown` and rings, never failing the send.
- **Opt-out for a heads-down recipient** — `mail send --no-nudge` suppresses the delivery doorbell to
  every recipient shape (a peer's pane, a standing owner's bound presence, or its bound main pane);
  the message still lands durably, so a sender that must not interrupt a working recipient can
  deliver quietly.

**Non-goals** — the plain send/inbox/read/ack/delete primitives (`mail/core`); the pull-side hook
injection payload and owner-mail surfacing gate (`mail/surface`); the standalone `unit nudge` verb and
its boot-race submit-verify-retry contract (`unit/lifecycle`); minting the standing owner inbox and
binding or clearing its presence (`unit/registry`); binding the main pane (`attach/`); and what a rung
presence then *does* with the delivery — whether it takes a turn, what work it pulls, and on what
cadence is entirely the caller's judgment one layer up (this node only rings the bell). This node
covers only the on-delivery ring and its best-effort-never-fails-the-send contract. Any persona/place
name for the owner inbox or for the unit standing in for it (e.g. a fleet layer's "report-up" box) is
a higher-layer concern — this node knows only "standing owner", "presence", and "bound main pane".

Every scenario in [`doorbell.feature`](./doorbell.feature) maps to one of these behaviors:

| Behavior | What it covers |
|---|---|
| **a peer with a live pane is rung on delivery** | send rings the recipient's pane via the submit-verify path (taken turn, delivered once); the sender's own pane is never rung |
| **the wake never fails the send** | no live pane → no-op, send succeeds, surfaces next SessionStart; a ring past the retry cap → best-effort warning, message still lands |
| **a standing owner with a bound presence is rung there** | a standing-owner recipient with a live bound presence rings that unit's pane, never the main pane, and never focus-gated (the peer rule: a presence is an agent expected to take the turn); an exited presence falls back to the main pane, never rings a corpse |
| **a standing owner is notified at the bound main pane** | with no presence bound, a standing-owner recipient rings the bound main pane; no main pane bound → store-and-forward no-op |
| **the standing-owner ring gates on focus** | applies only to the main-pane fallback: positively-not-focused → ring skipped, report stays queued (surfaces on next SessionStart); focused or unknown-focus → rings (fail-open); neither a peer nor a bound presence is ever focus-gated |
| **opt-out** | `--no-nudge` suppresses the doorbell to every recipient shape (peer pane, standing owner's bound presence, or its bound main pane); the message still lands |
