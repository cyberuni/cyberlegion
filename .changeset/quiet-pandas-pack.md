---
'cyberlegion': patch
---

Removed the package's `prepack` script. It ran `pnpm build`, and the build tool writes
ANSI-colored progress lines to stdout — which corrupted the JSON that `npm pack --json`
emits, so any tool inspecting the package that way got a parse error instead of a file
list. Nothing is lost by dropping it: every path that packs or publishes this package
already builds first.
