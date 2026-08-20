---
'cyberlegion': patch
---

Restored the license file in the published tarball. Up to 0.3.1 this package was
published from a monorepo whose root license file was picked up automatically at publish
time. After the move to its own repository the root file is named in lower case, which
that mechanism no longer matched, so the tarball would have shipped with no license text
at all — only the `license: MIT` field in the manifest. The package now carries its own
copy, so the license travels with the code regardless of what the repository root is
called.
