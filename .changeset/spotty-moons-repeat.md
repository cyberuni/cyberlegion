---
'cyberlegion': patch
---

`--version` now reports the version from the package manifest instead of a hardcoded
`0.0.0`. Every release since 0.0.1 shipped a CLI that reported `0.0.0` regardless of the
version actually installed, which made `npx cyberlegion@<pin> --version` useless for
confirming which build was running. The test that covered `--version` asserted the literal
`0.0.0`, so it pinned the defect rather than catching it; it now asserts against the
manifest and fails loud on a placeholder.
