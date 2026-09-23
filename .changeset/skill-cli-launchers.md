---
"cyberlegion": minor
---

The plugin's skills now run the CLI they ship with. Each skill that calls `cyberlegion` carries a `scripts/cyberlegion.mjs` launcher that runs this package's own CLI, so a skill no longer pays for an `npx` fetch on every call or races other agents on the npx cache. Where the launcher cannot be resolved, a skill names one fallback pinned to the version that shipped it, and `pnpm version` now rewrites those pins and `.plugin/pins.json` at every release.
