---
'cyberlegion': patch
---

Move `commander` to `devDependencies`. Only the bundled CLI uses it, and the CLI carries its own inlined copy, so installing `cyberlegion` no longer pulls in `commander`.
