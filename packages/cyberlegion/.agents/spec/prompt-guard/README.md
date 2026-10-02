---
spec-type: behavioral
concept: [cyberlegion]
---

# prompt-guard — never type over a human's unsent draft

Every path where the CLI types into a peer's input box — the `mail send` delivery doorbell
(`mail/doorbell`), the spawn first-turn doorbell and `unit nudge` and `unit clear`
(`unit/lifecycle`) — first reads that input box. Text sitting in it most likely means a human is
typing there, and typing ours on top would either splice the two together or submit the human's
half-written text as part of our turn.

## Use Cases

**Subject** — the input box of the pane about to be typed into, read off the same plain-text screen
scrape `unit read` uses, through a per-harness shape (Claude Code, Codex, cursor-agent):

- **An empty box is typed into at once** — no draft, no wait; the ring behaves exactly as before.
  An idle placeholder (dim on screen, plain text in a scrape) counts as empty: each harness's known
  placeholders are recognized by wording.
- **A box the reader does not recognize is typed into at once** — a booting harness, a dialog, or an
  unlisted harness reads as *unknown*, and unknown keeps today's behavior rather than blocking.
- **A draft the human is working on is waited out** — the box is polled; once the human sends or
  clears it, ours is typed into the now-empty box and the draft is never touched.
- **A draft unchanged for 20 seconds means the human stepped away** — the draft is recorded, the box
  cleared (Ctrl-E then Ctrl-U, sent as raw bytes so every backend delivers them alike), ours is
  typed and taken, and the draft is typed back into the box **unsent**. It is typed back even when
  our send fails. Any change to the draft restarts the 20 seconds.
- **A draft that keeps changing for 60 seconds is left alone** — the send gives up without typing
  anything. For the doorbell that is the existing best-effort warning: the mail already landed and
  surfaces on the recipient's next read. For `unit nudge` and `unit clear` it is the command's error.
- **An idle draft spanning more than one row is left alone** — a scrape cannot tell a wrapped row
  from a typed newline, and a newline typed back would submit the draft, so it is not cleared and
  ours is not sent.
- **Text the clear does not remove was never a draft** — an idle placeholder the reader does not
  know survives Ctrl-U; ours is typed and nothing is typed back.

- **Text the CLI itself typed is not a draft** — a harness can take a ring and put its text back in
  the box (cursor-agent with a rejected login does). The box's text, with whitespace ignored since
  the box wraps it anywhere, is compared against the rings the CLI knows: the delivery doorbell, a
  spawn doorbell, and the text about to be rung. On a match the box is cleared at once — no idle
  wait, and no multi-row refusal, since the CLI's own ring holds no typed newline — ours is typed,
  and nothing is typed back. A human draft that merely quotes a doorbell does not match.

**Non-goals** — whether to ring at all (`mail/doorbell`: `--no-nudge`, the focus gate, recipient
shapes); the submit-verify-flush taken-turn contract (`unit/lifecycle`); reading styling from the
pane (`mux`'s read is plain text on every backend).

Every scenario in [`prompt-guard.feature`](./prompt-guard.feature) maps to one of these behaviors:

| Behavior | What it covers |
|---|---|
| **empty box** | typed at once, placeholder counts as empty |
| **unknown box** | typed at once, as before |
| **draft waited out** | human sends or clears → ours typed, draft untouched |
| **stepped away** | 20s unchanged → clear, send, type back unsent; typed back on failure; change restarts the clock |
| **still typing** | 60s of changes → nothing typed, the caller's failure path |
| **multi-row** | idle multi-row draft → untouched, nothing sent |
| **unremovable text** | survives the clear → sent, nothing typed back |
| **own ring** | a doorbell the harness put back → cleared at once, sent, nothing typed back |
