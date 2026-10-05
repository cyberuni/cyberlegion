import { existsSync, realpathSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { resolveAgentDef } from './agentdef/resolve.ts'
import type { Exec } from './identity.ts'
import { LAUNCH_MAP, primaryRootOf } from './session.ts'
import type { Harness, StandingHome } from './store/store.ts'

/** The home flags `unit register` takes, as Commander hands them over. */
export interface HomeFlags {
	standing?: boolean
	handle?: string
	home?: string
	clearHome?: boolean
	agent?: string
	harness?: string
}

/**
 * Decide what a registration does to a standing owner's home: `undefined` keeps whatever the record
 * already has, `null` drops it, and a `StandingHome` replaces it. Every way a home can be wrong is
 * refused here, before anything is written — a failure found at delivery time could only be a warning
 * on someone else's send.
 *
 * The checks run in a fixed order so that a combination matching two refusals gets the first:
 * a home flag outside a named standing registration, then `--home` with `--clear-home`, then a launch
 * with no `--home`, then the folder, the launch, and the primary checkout.
 *
 * `--harness` is a home flag only on a standing registration; a plain `unit register` takes it for
 * the session itself.
 */
export function resolveHomeFlags(exec: Exec, flags: HomeFlags): StandingHome | null | undefined {
	const homeFlag = flags.home !== undefined || flags.clearHome === true || flags.agent !== undefined
	if (homeFlag && !(flags.standing && flags.handle)) {
		throw new Error('a home belongs only to a named standing owner — pass --standing --handle <name>')
	}
	if (!flags.standing) return undefined
	if (flags.home !== undefined && flags.clearHome) throw new Error('--home and --clear-home contradict — pass one')
	if (flags.home === undefined && (flags.agent !== undefined || flags.harness !== undefined)) {
		throw new Error('a launch needs --home: --agent and --harness name how to start a session in it')
	}
	if (flags.clearHome) return null
	if (flags.home === undefined) return undefined

	const dir = resolve(flags.home)
	if (!existsSync(dir) || !statSync(dir).isDirectory()) {
		throw new Error(`the home must already exist: ${flags.home}`)
	}
	if ((flags.agent === undefined) === (flags.harness === undefined)) {
		throw new Error('a home needs exactly one of --agent or --harness')
	}
	let launch: { agent: string } | { harness: Harness }
	if (flags.harness !== undefined) {
		if (!(flags.harness in LAUNCH_MAP)) {
			throw new Error(`unrecognized --harness "${flags.harness}" (${Object.keys(LAUNCH_MAP).join(' | ')})`)
		}
		launch = { harness: flags.harness as Harness }
	} else {
		const agent = flags.agent as string
		try {
			resolveAgentDef({ name: agent, cwd: dir })
		} catch {
			throw new Error(`the agent definition "${agent}" does not resolve from the home ${dir}`)
		}
		launch = { agent }
	}
	const primary = primaryRootOf(exec, dir)
	if (primary !== undefined && realpathSync(primary) === realpathSync(dir)) {
		throw new Error(`the home refuses the primary checkout ${dir} — a spawned unit never works there`)
	}
	return { dir, ...launch }
}
