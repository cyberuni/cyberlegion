---
"cyberlegion": minor
---

Add project references and project services with fenced, resolve-or-start ownership.

- `project register|list|show` give a repository one stable id shared by its default checkout and every linked worktree, resolvable by id, path, or unique name from anywhere.
- `service resolve|acquire|bind|release|handoff|verify|start` give each named project service exactly one authoritative owner. Concurrent starts converge on one reservation; failed starts are retryable; a healthy owner is only displaced by an explicit, generation-checked force; handoff and recovery bump a fencing generation that `service verify` checks.
- A service endpoint is a durable mailbox independent of its owners (`mail inbox --owner <endpoint>`), exempt from prune and refused by `unit close`, so pending mail survives owner replacement. A pane-less owner reports that its session control is not recoverable.
