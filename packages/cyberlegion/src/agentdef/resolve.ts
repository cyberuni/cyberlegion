// agent-definition resolution — reads a universal `.md` agent def (YAML frontmatter + Markdown
// body) as used under `.agents/agents/*.md` and `plugins/*/agents/*.md`: `model`/`effort` +
// the cyberlegion-only `harness`/`warm`/`interactive` routing tags. Reads a FILE ONLY — no
// knowledge of plugin namespacing, SDD, or the def's author; a plugin-scoped def is passed in by
// explicit `--agent-file <path>`.

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import type { Harness } from '../identity.ts'
import { projectRoot } from '../paths.ts'

export interface AgentDef {
	name: string
	description?: string
	model?: string
	effort?: string
	harness?: Harness
	warm?: boolean
	interactive?: boolean
	instructions: string
	path: string
}

interface RawFrontmatter {
	name?: string
	description?: string
	model?: string
	effort?: string
	harness?: string
	warm?: string
	interactive?: string
}

// ── Frontmatter parse (a minimal YAML subset — top-level string scalars + `>`/`|` block scalars,
// quoted or bare) — no yaml dependency, mirrors the house pattern in discover-specs.mts. ──
export function parseAgentDefFile(text: string): { fm: RawFrontmatter; instructions: string } {
	const m = /^---\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n)?([\s\S]*)$/.exec(text)
	if (!m) return { fm: {}, instructions: text.trim() }
	const [, block, rest] = m
	const fm: Record<string, string> = {}
	const lines = block.split('\n')
	let i = 0
	while (i < lines.length) {
		const line = lines[i].replace(/\r$/, '')
		if (line.trim() === '' || line.trim().startsWith('#')) {
			i++
			continue
		}
		const indent = line.length - line.trimStart().length
		if (indent > 0) {
			// only top-level keys are meaningful for an agent def's routing tags
			i++
			continue
		}
		const idx = line.indexOf(':')
		if (idx === -1) {
			i++
			continue
		}
		const key = line.slice(0, idx).trim()
		let value = line.slice(idx + 1).trim()
		i++
		if (value === '>' || value === '>-' || value === '|' || value === '|-') {
			const parts: string[] = []
			while (i < lines.length) {
				const l = lines[i].replace(/\r$/, '')
				if (l.trim() === '') {
					i++
					continue
				}
				if (l.length - l.trimStart().length === 0) break
				parts.push(l.trim())
				i++
			}
			value = parts.join(value.startsWith('|') ? '\n' : ' ')
		}
		fm[key] = unquote(value)
	}
	return { fm, instructions: rest.trim() }
}

function unquote(v: string): string {
	if (v.length >= 2 && ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))) {
		return v.slice(1, -1)
	}
	return v
}

function toBool(v: string | undefined): boolean | undefined {
	if (v === undefined) return undefined
	if (v === 'true') return true
	if (v === 'false') return false
	return undefined
}

function toAgentDef(path: string, text: string, fallbackName: string): AgentDef {
	const { fm, instructions } = parseAgentDefFile(text)
	return {
		name: fm.name ?? fallbackName,
		description: fm.description,
		model: fm.model,
		effort: fm.effort,
		harness: fm.harness as Harness | undefined,
		warm: toBool(fm.warm),
		interactive: toBool(fm.interactive),
		instructions,
		path,
	}
}

export interface ResolveAgentDefInput {
	/** Resolve `<name>.md` by search — mutually exclusive with `file`. */
	name?: string
	/** Read this exact path — bypasses name search entirely (the plugin-scoped escape hatch). */
	file?: string
	/** Extra dirs to search (each dir is checked for `<name>.md`), ahead of the project convention. */
	searchRoots?: string[]
	cwd?: string
}

/** The project's own `.agents/agents/` dir — the convention `agent list`/name-search scans. */
function projectAgentsDir(cwd?: string): string {
	return join(projectRoot(cwd), '.agents', 'agents')
}

/** Resolve one agent definition, by explicit file or by name search. Throws a clear error when
 * neither locates a def — never returns a partial/empty result. */
export function resolveAgentDef(input: ResolveAgentDefInput): AgentDef {
	if (input.file) {
		const path = resolve(input.file)
		if (!existsSync(path)) throw new Error(`agent def file "${input.file}" does not exist`)
		return toAgentDef(path, readFileSync(path, 'utf8'), basename(path).replace(/\.md$/, ''))
	}
	if (!input.name) throw new Error('resolveAgentDef needs a --agent <name> or --agent-file <path>')
	const roots = [...(input.searchRoots ?? []), projectAgentsDir(input.cwd)]
	for (const root of roots) {
		const candidate = join(root, `${input.name}.md`)
		if (existsSync(candidate)) {
			return toAgentDef(candidate, readFileSync(candidate, 'utf8'), input.name)
		}
	}
	throw new Error(`no agent definition named "${input.name}" found under .agents/agents/`)
}

/** List every resolvable agent def under `.agents/agents/` (+ any extra search roots). Definitive
 * empty array when the dir is absent or empty — never throws for "none found" here (unlike a
 * named resolve, listing is inherently zero-or-more). */
export function listAgentDefs(input: { cwd?: string; searchRoots?: string[] } = {}): AgentDef[] {
	const roots = [...(input.searchRoots ?? []), projectAgentsDir(input.cwd)]
	const seen = new Set<string>()
	const defs: AgentDef[] = []
	for (const root of roots) {
		if (!existsSync(root)) continue
		for (const file of readdirSync(root)) {
			if (!file.endsWith('.md')) continue
			const path = join(root, file)
			if (seen.has(path)) continue
			seen.add(path)
			defs.push(toAgentDef(path, readFileSync(path, 'utf8'), file.replace(/\.md$/, '')))
		}
	}
	return defs
}
