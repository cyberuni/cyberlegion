---
spec-type: behavioral
concept: [cyberlegion]
---

# attach — the human's read-pane (an attention pointer)

Records and reports the hub's single main pane — the pane `mail/surface`'s hook surfacing treats as
the standing owner's live presence, where owner mail surfaces. Migrated CR-2 from `identity/`'s
`bind-main`/`main` scenarios (`cyberlegion-cli-realign`, ADR-0024): `attach` is an attention pointer,
not an identity primitive, so it earns its own top-level node.

## Use Cases

**Subject** — a hub-level singleton pointer, independent of any agent record, naming the one pane a
human is reading from:

- **attach records the caller's current pane as the hub main pane** — a hub-level singleton keyed by
  the pane id; binding from a different pane **moves** it (last bind wins, still exactly one). It
  throws when the caller is in no multiplexer pane — there is nothing to bind.
- **attach --clear removes the binding** — a no-op, never an error, when none is bound.
- **attach --show prints the bound pane or a definitive "none"** — the read form of the verb. One
  flag family, no ambiguity: bare `attach` always binds (was `bind-main`), `--clear` unbinds, `--show`
  reads (was `main`), and `--follow` (deferred, CR-4) auto-moves it via tmux focus-events.
- **Binding a main pane neither creates nor requires a standing owner** — the durable inbox (`unit
  register --standing`) and where it surfaces (`attach`) are minted independently.

**Non-goals** — minting the standing owner inbox (`unit/registry`); owner-mail surfacing itself,
which reads the bound pane this node records (`mail/surface`); `attach --follow` (tmux focus-events),
deferred per the CR design and not scoped to CR-2.

Every scenario in [`attach.feature`](./attach.feature) maps to one of these behaviors:

| Behavior | What it covers |
|---|---|
| **attach records the caller's pane** | binds the current pane as the hub's single main pane; moves on rebind; throws in no pane |
| **attach --clear** | unbinds; no-op when unbound |
| **attach --show** | prints the bound pane or "none" |
| **independent of a standing owner** | binding neither creates nor requires one |
