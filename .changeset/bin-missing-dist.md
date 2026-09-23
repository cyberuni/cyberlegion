---
'cyberlegion': patch
---

`bin/cyberlegion.mjs` now fails with a clear message when `dist/cli.mjs` is missing, naming the file and the same-version `npx -y cyberlegion@<version>` fallback, instead of a raw `ERR_MODULE_NOT_FOUND`.
