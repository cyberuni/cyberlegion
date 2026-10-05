---
cr-ref: standing-home-spawn
project: cyberlegion
status: active
todos:
  - content: "explore: recipe on the standing record (unit/registry) + spawn-on-delivery step in the doorbell (mail/doorbell)"
    status: completed
  - content: "spec gate: cold spec-judge, structural diff (expect addOnly on both frozen suites), ledger gate line"
    status: completed
  - content: "deliver: home field on AgentRecord, register --home/--agent/--harness/--no-home, doorbell spawn under presence lock"
    status: completed
  - content: "impl gate: cold impl-judge over the frozen scenarios; pnpm verify green; dist rebuilt"
    status: completed
  - content: "handoff: PR against main (never merged), changeset, report to op-cyberlegion"
    status: completed
---

# standing-home-spawn — a standing owner with a home, spawned on demand

CR source: a dispatch brief (no forge issue). No closing reference.

**Problem.** A standing owner (a durable inbox, `unit register --standing`) is reached on delivery
only when a live presence is bound (`unit claim`) or a human's main pane is focused. Mail sent while
neither holds sits unread until someone looks. Senders with no multiplexer (cron, headless) are the
ones that most need the owner woken.

**Shape.**

- `unit register --standing --handle <h> --home <dir> (--agent <def> | --harness <h>)` stores a
  launch recipe on the standing record, separate from the incidental `cwd`. `--no-home` drops it;
  a re-register naming neither keeps it.
- Doorbell order for a standing owner: live presence → ring it; else a recipe → spawn a unit in the
  home (its own workspace), bind it as the presence under the presence lock, wake it with the
  first-turn doorbell naming a brief that points at the owner's inbox; else the focus-gated main pane.
- A spawn that cannot happen (no multiplexer reachable, missing home, lock timeout) is a visible
  warning and degrades to the no-recipe path; it never fails the send.

## NEXT

Landed on the CR branch and opened as a PR for the owner to ratify and merge. Spec gate and impl
gate are both self-asserted in the ledger shard. Four backlog follow-ups are recorded there (stuck
trust pile-up, sender latency, tmux detached open, presence-lock contention on re-register). They
are not filed as issues; the owner decides whether to file them. No resume action remains.
