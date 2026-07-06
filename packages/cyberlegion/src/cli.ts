import { Command } from 'commander'

// cyberlegion — the CLI is pure mechanism (dumb hands the Legate composes). Routing
// (warm-peer vs cold-subagent vs run-inline) is never decided here. Command groups:
//   identity · session · mail · dispatch · agent · admin
// Verbs are filled in by later change requests; this scaffold wires the program shell only.

const VERSION = '0.0.0'

const program = new Command()
	.name('cyberlegion')
	.description('Harness-agnostic agent session spawning, messaging, and dispatch over the filesystem')
	.version(VERSION)

const GROUPS: ReadonlyArray<readonly [string, string]> = [
	['identity', 'self-identify and discover peers'],
	['session', 'warm peer session lifecycle over a multiplexer'],
	['mail', 'durable inter-agent messaging'],
	['dispatch', 'delegate work and await a result (result-slot primitives)'],
	['agent', 'resolve reusable agent definitions'],
	['admin', 'setup and diagnostics'],
]

for (const [group, description] of GROUPS) {
	program.command(group).description(description)
}

await program.parseAsync(process.argv)
