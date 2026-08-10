#!/usr/bin/env node
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))
const { runCli } = await import(join(dir, '..', 'dist', 'cli.mjs'))
await runCli()
