// Pure translations from a Commander options object into the domain's own inputs. These are the
// wires that used to live inline in a `.action()` body, where nothing could reach them: the CLI
// entrypoint is a module-scope `parseAsync` with no exports, so an option that stopped being
// forwarded — or was forwarded inverted — changed real behavior with the suite green.

import { resolveSpawnLaunch } from './agentdef/realize.ts'
import type { SpawnInput } from './session.ts'

/** The Commander shape `unit spawn` produces. `--no-wake` sets `wake: false` (negated option). */
export interface SpawnCommandOptions {
	harness?: string
	agent?: string
	agentFile?: string
	task?: string
	briefFile?: string
	handle?: string
	branch?: string
	worktreePath?: string
	cwd?: string
	at?: SpawnInput['at']
	wake?: boolean
}

/**
 * Translate `unit spawn`'s options into the spawn input and its wake decision — resolving an
 * `--agent`/`--agent-file` def into the harness and composed launch command, with an explicit
 * `--harness` overriding the def's own.
 *
 * Throws when no harness can be resolved, so the CLI's own `fail()` still renders it.
 */
export function spawnCommandInput(opts: SpawnCommandOptions): { input: SpawnInput; noWake: boolean } {
	const { harness, command } = resolveSpawnLaunch({
		agent: opts.agent,
		agentFile: opts.agentFile,
		harness: opts.harness,
	})
	if (!harness) throw new Error('unit spawn needs --harness, or --agent/--agent-file resolving one')
	return {
		input: {
			harness,
			command,
			task: opts.task,
			briefFile: opts.briefFile,
			handle: opts.handle,
			branch: opts.branch,
			worktreePath: opts.worktreePath,
			cwd: opts.cwd,
			at: opts.at,
		},
		// Commander sets `wake: false` for `--no-wake`; anything else means ring.
		noWake: opts.wake === false,
	}
}

/** What `unit read` prints: the raw scrape, or the JSON envelope under `--format json`. */
export function readCommandOutput(format: string, result: { ref: string; pane: string; output: string }): string {
	return format === 'json' ? JSON.stringify(result, null, 2) : result.output
}
