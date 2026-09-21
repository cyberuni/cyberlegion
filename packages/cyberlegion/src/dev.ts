// Source entry for `pnpm cl dev`. `src/cli.ts` only defines the program and exports `runCli`, so
// that tests can drive it and the bin can call it from the built `dist/cli.mjs`; running cli.ts
// directly parses nothing. This file is the from-source counterpart of `bin/cyberlegion.mjs`.
import { runCli } from './cli.ts'

await runCli()
