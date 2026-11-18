---
"cyberlegion": minor
---

Skills run the CLI through universal-plugin forwarders instead of a compiled copy of the whole CLI in each skill (about 210 KB each). A forwarder runs the `cyberlegion` package it sits in, or `npx -y cyberlegion@<version>` from a skill folder copied on its own. Skill text no longer names an npx fallback line.
