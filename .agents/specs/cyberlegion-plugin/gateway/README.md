---
spec-type: behavioral
concept: routing
---

# gateway — the `cyberlegion` front door

The front door to the Legion: the `cyberlegion` skill classifies a request against a fixed
intent → CLI-call table and either runs the matching call directly or hands a dispatch intent to
`dispatch/`. It is a **thin classifier**: it holds no production logic, loads no other governance,
and writes no state. For an attended session it spawns nothing — the classifying session acts
directly. Its only spawn is `legate`, the headless realization of this same flow, summoned when
there is no user or peer channel to relay through.

## Use Cases

**Subject** — recognizing what an agent session wants from the Legion (messaging, session
lifecycle, dispatch) and routing it to the right mechanism, without doing the work itself.

**Non-goals** — picking a dispatch strategy (that judgment belongs to `dispatch/`); talking to the
filesystem or another session directly (every mechanic is a `cyberlegion` CLI call); invoking a
harness's own Task/subagent tool (only `dispatch/`'s subagent path does that, via
`subagent-backend-governance`).

| Behavior | Trigger | Outcome |
|---|---|---|
| **classify a messaging intent** | "send a message to `<peer>`", "check my inbox", "wait for a reply" | runs the matching `mail`/`session`/`identity` CLI call directly |
| **classify a dispatch intent** | "dispatch this work to fulfill `<role>`", "get a verdict from `<role>` on `<brief>`" | loads `dispatch-governance` in-session — does not pick a strategy itself |
| **spawn `legate` when headless** | the gateway is reached with no live user or peer channel (an unattended trigger, a multi-unit fan-out) | spawns the `legate` agent by name, which realizes this same flow headless |
| **doorbell vs. mailbox discipline** | any request that involves waking a peer | a nudge (`session nudge`) never carries content; the payload always lives in the mailbox (`mail send` or a dispatch's brief/result files) |
