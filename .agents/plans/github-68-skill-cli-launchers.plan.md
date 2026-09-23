---
cr-ref: github-68-skill-cli-launchers
project: cyberlegion-plugin
status: active
todos:
  - content: "explore: new cli-launcher/ node — README (Use Cases, Control Flow, map) + cli-launcher.feature"
    status: completed
  - content: "spec gate: check:suite + cold spec-judge; freeze cli-launcher.feature; ledger gate line"
    status: completed
  - content: "deliver: launcher per CLI-calling skill, skill bodies to node scripts/cyberlegion.mjs, version-flow pin regen"
    status: completed
  - content: "impl gate: cold impl-judge; run a launcher from an installed-shape dir; run the version flow"
    status: completed
  - content: "handoff: PR against main (Closes #68), CI green, mail operator"
    status: completed
---

# github-68 — skills run the CLI they ship with

CR source: cyberuni/cyberlegion issue #68.

**Defect.** Skills call `npx cyberlegion@0.3.1 …` (~30 sites, 6 skills) while the package is 0.4.0;
nothing regenerates the pin at release. Every call also pays npx resolve cost and risks the
`~/.npm/_npx` `ENOTEMPTY` race under parallel agents.

**Fix.** (1) `skills/<skill>/scripts/cyberlegion.mjs` in each CLI-calling skill imports the package's
own `bin/cyberlegion.mjs`, resolved from `import.meta.url`; bodies call `node scripts/cyberlegion.mjs`.
(2) One pinned `npx -y cyberlegion@<version>` fallback line per skill; `pnpm version` regenerates every
pin (skills, `.plugin/pins.json`, readmes) from `package.json`, and a test fails on a stale pin.

**Frozen init suite untouched.** `init-cyberlegion` keeps reading `.plugin/pins.json` for `--pin` and
for its fallback version; the version flow now regenerates that map too.

**Out of scope (report, do not land).** cyberfleet's bare `cyberlegion` calls; the `mail hook` command
`init` registers (`npx cyberlegion[@pin]`).

## NEXT

Landed as a PR against main (Closes #68): both gates self-asserted, provisional pending the owner's
ratification at the PR. No resume action remains. Two backlog follow-ups are recorded in the ledger
(stale npx examples in the readmes and install guide; an explicit `check:pins` script).
