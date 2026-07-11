---
spec-type: behavioral
concept: [cyberlegion]
---

# admin — hub-state maintenance

A new node (CR-2, `cyberlegion-cli-realign`, ADR-0024): onboarding is `init/`; ongoing hub-state
maintenance — merging one hub's state into another — is `admin/`. Its `migrate` scenarios are
newly authored in CR-2 (backfilled from `src/admin.ts`); `admin doctor` moved to
[`mux/`](../mux/README.md) (multiplexer/harness self-diagnosis is a `mux` concern) and `admin install`
folded into [`init/`](../init/README.md).

## Use Cases

**Subject** — merging one cyberlegion hub's durable state into another:

- **migrate merges a source hub into the destination** — `admin migrate` (`src/admin.ts`
  `migrateStore`, `cli.ts:809`) merges agents, messages, and briefs from a source hub into the
  destination hub: ids already present in the destination are skipped, and messages are re-filed
  into the destination as unread (best-effort — it does not preserve the source's read/unread
  split). An already-present agent's record is skipped but its source mail is still carried over.

**Non-goals** — multiplexer/harness self-diagnosis (`admin doctor`, now `mux doctor` in `mux/`); the
auto-detecting onboarding front door and the per-harness hook installer (`init/`); the unit registry
and lifecycle (`unit/`).

Every scenario in [`admin.feature`](./admin.feature) maps to one of these behaviors:

| Behavior | What it covers |
|---|---|
| **migrate** | merges agents/messages/briefs into the destination; skips already-present agent records (but still carries their mail); re-files messages as unread; stamps the destination marker |
