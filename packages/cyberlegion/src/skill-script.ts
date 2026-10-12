// Source entry of the skill scripts `plugin build` compiles into skills/<skill>/scripts/cyberlegion.mjs.
// Each compiled file inlines the CLI, so a skill linked or copied on its own runs with no package
// around it. This is the skill-folder counterpart of `bin/cyberlegion.mjs`.
import { runCli } from './cli.ts'

await runCli()
