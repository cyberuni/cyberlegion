import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

// The Claude Code permission rule that lets every `cyberlegion` subcommand run without a prompt or
// an auto-mode classifier denial. Without it the classifier can deny a unit's `mail send` as an
// external write, and a unit that finished its work cannot report back (#120).
export const CLI_RULE = 'Bash(cyberlegion *)'

// Allow rules that already let `cyberlegion <subcommand>` through: the CLI rule in its space, colon,
// or glob spelling, or a blanket Bash allow. `Bash(cyberlegion)` matches the bare command only.
const COVERING = /^Bash(?:\((?:\*|cyberlegion(?: \*|:\*|\*))\))?$/

export type PermissionRuleState = 'present' | 'missing' | 'unreadable'

/** Claude Code's user settings file: `$CLAUDE_CONFIG_DIR/settings.json`, else `~/.claude/settings.json`. */
export function claudeUserSettingsFile(env: NodeJS.ProcessEnv = process.env): string {
	return join(env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude'), 'settings.json')
}

// The settings and their allow list, or an error naming why the file cannot be safely rewritten.
function readSettings(file: string): { settings: Record<string, unknown>; allow: unknown[] } {
	if (!existsSync(file)) return { settings: {}, allow: [] }
	let settings: unknown
	try {
		settings = JSON.parse(readFileSync(file, 'utf8'))
	} catch {
		throw new Error(`cannot parse Claude Code settings ${file} — fix it by hand, then re-run`)
	}
	if (typeof settings !== 'object' || settings === null || Array.isArray(settings)) {
		throw new Error(`Claude Code settings ${file} is not a JSON object — fix it by hand, then re-run`)
	}
	const { permissions } = settings as { permissions?: unknown }
	const allow = (permissions as { allow?: unknown } | undefined)?.allow ?? []
	if (
		(permissions !== undefined && (typeof permissions !== 'object' || permissions === null)) ||
		!Array.isArray(allow)
	) {
		throw new Error(`Claude Code settings ${file} has a malformed permissions.allow — fix it by hand, then re-run`)
	}
	return { settings: settings as Record<string, unknown>, allow }
}

const covers = (allow: unknown[]) => allow.some((rule) => typeof rule === 'string' && COVERING.test(rule))

/** Whether the settings file's allow list already lets `cyberlegion` subcommands run. */
export function permissionRuleState(file: string): PermissionRuleState {
	try {
		return covers(readSettings(file).allow) ? 'present' : 'missing'
	} catch {
		return 'unreadable'
	}
}

/**
 * Add the CLI rule to the settings file's allow list, merged in after every existing entry. A
 * covering rule already there is a no-op; a file that cannot be read as settings is never rewritten.
 */
export function addPermissionRule(file: string): 'added' | 'present' {
	const { settings, allow } = readSettings(file)
	if (covers(allow)) return 'present'
	const permissions = (settings.permissions ?? {}) as Record<string, unknown>
	settings.permissions = { ...permissions, allow: [...allow, CLI_RULE] }
	mkdirSync(dirname(file), { recursive: true })
	writeFileSync(file, `${JSON.stringify(settings, null, 2)}\n`)
	return 'added'
}
