---
"cyberlegion": patch
---

Each skill's `scripts/cyberlegion.mjs` is now a self-contained script that `plugin build` compiles from `src/skill-script.ts`, instead of a launcher that reached up three levels to `bin/cyberlegion.mjs` and fell back to `npx`. A skill linked or copied on its own, including one linked out of `node_modules` by pnpm, runs the CLI it shipped with and needs no package, no `node_modules`, and no TypeScript at runtime. cynapse stays an optional peer: the compiled script loads it at runtime when it resolves and runs without it otherwise.
