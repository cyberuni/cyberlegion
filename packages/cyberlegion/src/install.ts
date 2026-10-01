import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { Harness } from './identity.ts'
import type { HookEvent } from './runtime/inject-inbox.ts'

// A --pin must be a single npm version-or-dist-tag token so it embeds safely into the
// `npx -y cyberlegion@<pin>` fallback of the hook command — no whitespace, ranges, `@`, or shell
// metacharacters that would break or hijack the registered command. Accepts `1.2.3`,
// `1.2.3-rc.1+build.5`, `latest`.
const PIN_TOKEN = /^[0-9A-Za-z][0-9A-Za-z._+-]*$/
export function validatePin(pin: string): void {
	if (!PIN_TOKEN.test(pin)) {
		throw new Error(
			`invalid --pin "${pin}" — expected a version or dist-tag token like 0.2.0 or latest (no spaces, ranges, or shell metacharacters)`,
		)
	}
}

// The project hook for a harness whose plugin does not ship one: a `cyberlegion` on PATH (a spawned
// unit's shim, or a deliberate install) wins, and npx runs only when there is none. if/then/else, not
// `&& … ||`, so a failing PATH run never also runs the npx copy.
const hookCommand = (event: HookEvent, pin?: string): string =>
	`if command -v cyberlegion >/dev/null 2>&1; then cyberlegion mail hook --event ${event}; else npx -y cyberlegion${pin ? `@${pin}` : ''} mail hook --event ${event}; fi`

// Every generation of the command init has written, each matched whole so an older entry is upgraded
// or removed rather than duplicated, while a user's own hook that merely calls cyberlegion (a wrapper,
// a compound command) is never touched: legacy bare, unpinned or pinned npx, and the PATH-first form.
const HOOK_GENERATIONS = [
	/^(?:npx (?:-y )?cyberlegion(?:@\S+)?|cyberlegion) mail hook --event (\w+)$/,
	/^if command -v cyberlegion >\/dev\/null 2>&1; then cyberlegion mail hook --event (\w+); else npx -y cyberlegion(?:@\S+)? mail hook --event \1; fi$/,
]

// The event an init-written surfacing hook fires for, or nothing for a hook that is not one.
function hookTarget(command: string): string | undefined {
	for (const generation of HOOK_GENERATIONS) {
		const event = command.match(generation)?.[1]
		if (event) return event
	}
	return undefined
}

interface VendorSpec {
	file: string
	shape: 'claude' | 'cursor'
	// canonical event -> the vendor's own event key (per vendors.json)
	events: Partial<Record<HookEvent, string>>
	// true when the cyberlegion plugin carries this hook itself (hooks/hooks.json): a project hook would
	// only fire it a second time, so init writes none and removes one an earlier init wrote.
	pluginHook: boolean
}

// SessionStart → all three; PostToolUse → Claude + Codex only (Cursor has none) — the same
// asymmetry cyberplace's build-definition / vendors.json encodes.
const VENDORS: Record<Harness, VendorSpec> = {
	claude: {
		file: '.claude/settings.json',
		shape: 'claude',
		events: { SessionStart: 'SessionStart', PostToolUse: 'PostToolUse' },
		pluginHook: true,
	},
	cursor: { file: '.cursor/hooks.json', shape: 'cursor', events: { SessionStart: 'sessionStart' }, pluginHook: false },
	codex: {
		file: '.codex/hooks.json',
		shape: 'cursor',
		events: { SessionStart: 'SessionStart', PostToolUse: 'PostToolUse' },
		pluginHook: true,
	},
}

type InstallStatus = 'registered' | 'already present' | 'provided by plugin' | 'removed project hook'
export interface InstallResult {
	harness: Harness
	event: HookEvent
	vendorEvent: string
	file: string
	status: InstallStatus
}

function readJson(file: string): Record<string, unknown> {
	if (!existsSync(file)) return {}
	try {
		return JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>
	} catch {
		return {}
	}
}

function writeJson(file: string, data: unknown): void {
	mkdirSync(dirname(file), { recursive: true })
	writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`)
}

/**
 * Make sure the surfacing hook fires for one harness, idempotently: leave it to the plugin where the
 * plugin ships it (removing an earlier project copy), otherwise register the PATH-first project hook.
 */
export function install(harness: Harness, projectDir = process.cwd(), pin?: string): InstallResult[] {
	const spec = VENDORS[harness]
	if (!spec) throw new Error(`unknown harness "${harness}" (expected claude | cursor | codex)`)
	if (pin !== undefined) validatePin(pin)
	const file = join(projectDir, spec.file)
	const settings = readJson(file)
	const results: InstallResult[] = []
	let changed = false

	for (const [canonical, vendorEvent] of Object.entries(spec.events) as [HookEvent, string][]) {
		let status: InstallStatus
		if (spec.pluginHook) {
			const removed =
				spec.shape === 'claude'
					? removeClaude(settings, vendorEvent, canonical)
					: removeCursor(settings, vendorEvent, canonical)
			status = removed ? 'removed project hook' : 'provided by plugin'
			changed ||= removed
		} else {
			const command = hookCommand(canonical, pin)
			status =
				spec.shape === 'claude'
					? upsertClaude(settings, vendorEvent, command)
					: upsertCursor(settings, vendorEvent, command)
			changed = true
		}
		results.push({ harness, event: canonical, vendorEvent, file, status })
	}
	if (changed) writeJson(file, settings)
	return results
}

interface ClaudeEntry {
	type: string
	command: string
}
interface ClaudeGroup {
	matcher?: string
	hooks: ClaudeEntry[]
}

function upsertClaude(settings: Record<string, unknown>, event: string, command: string): InstallStatus {
	const hooks = (settings.hooks ??= {}) as Record<string, ClaudeGroup[]>
	const groups = (hooks[event] ??= [])
	const target = hookTarget(command)
	for (const g of groups) {
		for (const h of g.hooks ?? []) {
			if (h.command === command) return 'already present'
			if (target && hookTarget(h.command) === target) {
				h.command = command
				return 'already present'
			}
		}
	}
	const group: ClaudeGroup = { hooks: [{ type: 'command', command }] }
	if (event === 'PostToolUse') group.matcher = 'Write|Edit'
	groups.push(group)
	return 'registered'
}

interface CursorEntry {
	command: string
}

function upsertCursor(settings: Record<string, unknown>, event: string, command: string): InstallStatus {
	if (settings.version == null) settings.version = 1
	const hooks = (settings.hooks ??= {}) as Record<string, CursorEntry[]>
	const list = (hooks[event] ??= [])
	const target = hookTarget(command)
	for (const h of list) {
		if (h.command === command) return 'already present'
		if (target && hookTarget(h.command) === target) {
			h.command = command
			return 'already present'
		}
	}
	list.push({ command })
	return 'registered'
}

const isOurs = (command: string | undefined, event: HookEvent) => command !== undefined && hookTarget(command) === event

function removeClaude(settings: Record<string, unknown>, event: string, canonical: HookEvent): boolean {
	const hooks = settings.hooks as Record<string, ClaudeGroup[]> | undefined
	const groups = hooks?.[event]
	if (!hooks || !groups) return false
	let removed = false
	const kept: ClaudeGroup[] = []
	for (const g of groups) {
		const entries = (g.hooks ?? []).filter((h) => !isOurs(h.command, canonical))
		if (entries.length !== (g.hooks ?? []).length) removed = true
		if (entries.length > 0) kept.push({ ...g, hooks: entries })
	}
	if (!removed) return false
	if (kept.length > 0) hooks[event] = kept
	else delete hooks[event]
	return true
}

function removeCursor(settings: Record<string, unknown>, event: string, canonical: HookEvent): boolean {
	const hooks = settings.hooks as Record<string, CursorEntry[]> | undefined
	const list = hooks?.[event]
	if (!hooks || !list) return false
	const kept = list.filter((h) => !isOurs(h.command, canonical))
	if (kept.length === list.length) return false
	if (kept.length > 0) hooks[event] = kept
	else delete hooks[event]
	return true
}
