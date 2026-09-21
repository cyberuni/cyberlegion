---
'cyberlegion': patch
---

An agent def whose `harness` tag is not `claude`, `cursor`, or `codex` now fails to resolve, with an error naming the value and the valid harnesses. Before this fix a typo such as `harness: claud` resolved, and `unit spawn --agent` built a launch command starting with `undefined`. `agent list` fails the same way when any def it finds carries an unknown harness.
