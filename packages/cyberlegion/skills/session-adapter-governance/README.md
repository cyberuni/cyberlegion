# session-adapter-governance

Internal cyberlegion governance. The **SessionAdapter conformance rule**, ratified from doctrine
entry 2 (ADR-0025): a mutating op — one that drives the mux to change session state — **verifies
its observable effect landed or fails loud**; never false success on a fire-and-forget send.

The rule is applied per **effect class**, never mechanically copied across ops:

- **Unconditional** (nudge, clear — effect observable regardless of who watches) → verify always.
- **Attach-relative** (focus — the effect only exists with an attached client) → verify only when
  the precondition holds; "no attached client" is a **legitimate no-op, not a failure** (a naive
  read-back false-fails headless spawns).

Carries the per-op conformance ledger (nudge = conformant reference pattern; focus land-verify and
clear verify-after = authorized follow-ups; delivery doorbell = conformant best-effort). Loaded by
name from a CR brief or a producer touching adapter operations. Not user-invocable — see
`SKILL.md`.
