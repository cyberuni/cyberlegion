import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { Harness } from './identity.ts'
import type { HookEvent } from './runtime/inject-inbox.ts'

// A --pin must be a single npm version-or-dist-tag token so it embeds safely into the
// `npx cyberlegion@<pin>` hook command — no whitespace, ranges, `@`, or shell metacharacters that
// would break or hijack the registered command. Accepts `1.2.3`, `1.2.3-rc.1+build.5`, `latest`.
const PIN_TOKEN = /^[0-9A-Za-z][0-9A-Za-z._+-]*$/
export function validatePin(pin: string): void {
	if (!PIN_TOKEN.test(pin)) {
		throw new Error(
			`invalid --pin "${pin}" — expected a version or dist-tag token like 0.2.0 or latest (no spaces, ranges, or shell metacharacters)`,
		)
	}
}

// The command a harness hook runs to surface unread mail.
const hookCommand = (event: HookEvent, pin?: string): string =>
	pin ? `npx cyberlegion@${pin} mail hook --event ${event}` : `npx cyberlegion mail hook --event ${event}`

// Strips a leading npx/bare cyberlegion prefix so hook commands from any generation
// (legacy bare, unpinned npx, pinned npx) compare on their shared `mail hook --event <event>` core.
function hookTarget(command: string): string | undefined {
	const match = command.match(/^(?:npx cyberlegion(?:@[^\s]+)?|cyberlegion) (mail hook --event \S+)$/)
	return match?.[1]
}

interface VendorSpec {
	file: string
	shape: 'claude' | 'cursor'
	// canonical event -> the vendor's own event key (per vendors.json)
	events: Partial<Record<HookEvent, string>>
}

// SessionStart → all three; PostToolUse → Claude + Codex only (Cursor has none) — the same
// asymmetry cyberplace's build-definition / vendors.json encodes.
const VENDORS: Record<Harness, VendorSpec> = {
	claude: {
		file: '.claude/settings.json',
		shape: 'claude',
		events: { SessionStart: 'SessionStart', PostToolUse: 'PostToolUse' },
	},
	cursor: { file: '.cursor/hooks.json', shape: 'cursor', events: { SessionStart: 'sessionStart' } },
	codex: {
		file: '.codex/hooks.json',
		shape: 'cursor',
		events: { SessionStart: 'SessionStart', PostToolUse: 'PostToolUse' },
	},
}

type InstallStatus = 'registered' | 'already present'
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

/** Register the surfacing hook into one harness's config, idempotently. */
export function install(harness: Harness, projectDir = process.cwd(), pin?: string): InstallResult[] {
	const spec = VENDORS[harness]
	if (!spec) throw new Error(`unknown harness "${harness}" (expected claude | cursor | codex)`)
	if (pin !== undefined) validatePin(pin)
	const file = join(projectDir, spec.file)
	const settings = readJson(file)
	const results: InstallResult[] = []

	for (const [canonical, vendorEvent] of Object.entries(spec.events) as [HookEvent, string][]) {
		const command = hookCommand(canonical, pin)
		const status =
			spec.shape === 'claude'
				? upsertClaude(settings, vendorEvent, command)
				: upsertCursor(settings, vendorEvent, command)
		results.push({ harness, event: canonical, vendorEvent, file, status })
	}
	writeJson(file, settings)
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
