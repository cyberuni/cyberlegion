import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { Harness } from './identity.ts'
import type { HookEvent } from './runtime/inject-inbox.ts'

// The command a harness hook runs to surface unread mail.
const hookCommand = (event: HookEvent): string => `cyberlegion mail hook --event ${event}`

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
export function install(harness: Harness, projectDir = process.cwd()): InstallResult[] {
	const spec = VENDORS[harness]
	if (!spec) throw new Error(`unknown harness "${harness}" (expected claude | cursor | codex)`)
	const file = join(projectDir, spec.file)
	const settings = readJson(file)
	const results: InstallResult[] = []

	for (const [canonical, vendorEvent] of Object.entries(spec.events) as [HookEvent, string][]) {
		const command = hookCommand(canonical)
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
	if (groups.some((g) => g.hooks?.some((h) => h.command === command))) return 'already present'
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
	if (list.some((h) => h.command === command)) return 'already present'
	list.push({ command })
	return 'registered'
}
