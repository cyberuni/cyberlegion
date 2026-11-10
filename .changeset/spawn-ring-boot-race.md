---
"cyberlegion": patch
---

`unit spawn` no longer leaves several unsent "Read your brief" lines in a new session's input box. The first-turn ring now waits for the harness to draw its input box before typing; keys typed while a harness boots are taken as one paste, so each Enter became a newline and re-typed copies piled up. Copies of the doorbell sitting in the input box are also no longer counted as a posted turn, so a staged doorbell is flushed with Enter instead of reported rung.
