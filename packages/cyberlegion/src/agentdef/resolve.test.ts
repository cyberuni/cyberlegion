import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { listAgentDefs, parseAgentDefFile, resolveAgentDef } from './resolve.ts'

let cwd: string
let agentsDir: string

beforeEach(() => {
	cwd = mkdtempSync(join(tmpdir(), 'cl-agentdef-'))
	agentsDir = join(cwd, '.agents', 'agents')
	mkdirSync(agentsDir, { recursive: true })
})

function writeDef(name: string, contents: string, dir = agentsDir): string {
	const path = join(dir, `${name}.md`)
	writeFileSync(path, contents)
	return path
}

const FULL_DEF = `---
name: reviewer
description: "Reviews a diff for correctness bugs."
model: sonnet
effort: high
harness: claude
warm: true
interactive: false
---

# Reviewer

Look for correctness bugs first.
`

describe('parseAgentDefFile', () => {
	it('parses string scalars, booleans, and the body as instructions', () => {
		const { fm, instructions } = parseAgentDefFile(FULL_DEF)
		expect(fm).toMatchObject({
			name: 'reviewer',
			description: 'Reviews a diff for correctness bugs.',
			model: 'sonnet',
			effort: 'high',
			harness: 'claude',
			warm: 'true',
			interactive: 'false',
		})
		expect(instructions).toContain('# Reviewer')
		expect(instructions).toContain('Look for correctness bugs first.')
	})

	it('folds a > block-scalar description across multiple lines into one space-joined string', () => {
		const text = `---
name: article-writer
description: >
  Use this agent to draft, rewrite, or polish long-form writing.
  Trigger on "write a post".
model: opus
---

Body text.
`
		const { fm } = parseAgentDefFile(text)
		expect(fm.description).toBe(
			'Use this agent to draft, rewrite, or polish long-form writing. Trigger on "write a post".',
		)
		expect(fm.model).toBe('opus')
	})

	it('leaves model/effort/harness/warm/interactive undefined when the def omits them', () => {
		const { fm } = parseAgentDefFile('---\nname: minimal\n---\n\nJust a body.\n')
		expect(fm.model).toBeUndefined()
		expect(fm.effort).toBeUndefined()
		expect(fm.harness).toBeUndefined()
		expect(fm.warm).toBeUndefined()
		expect(fm.interactive).toBeUndefined()
	})

	it('returns the whole text as instructions with no frontmatter block when there is none', () => {
		const { fm, instructions } = parseAgentDefFile('# No frontmatter\n\njust a body\n')
		expect(fm).toEqual({})
		expect(instructions).toBe('# No frontmatter\n\njust a body')
	})
})

describe('resolveAgentDef', () => {
	it('resolves by name under .agents/agents/, parsing frontmatter tags and the body', () => {
		writeDef('reviewer', FULL_DEF)
		const def = resolveAgentDef({ name: 'reviewer', cwd })
		expect(def.name).toBe('reviewer')
		expect(def.model).toBe('sonnet')
		expect(def.effort).toBe('high')
		expect(def.harness).toBe('claude')
		expect(def.warm).toBe(true)
		expect(def.interactive).toBe(false)
		expect(def.instructions).toContain('Look for correctness bugs first.')
		expect(def.path).toBe(join(agentsDir, 'reviewer.md'))
	})

	it('resolves an explicit --file path directly, bypassing name search entirely', () => {
		const outside = mkdtempSync(join(tmpdir(), 'cl-plugin-'))
		const path = writeDef('sdd-impl-judge', FULL_DEF, outside)
		const def = resolveAgentDef({ file: path })
		expect(def.path).toBe(path)
		expect(def.model).toBe('sonnet')
	})

	it('a def missing model/effort/harness resolves without error — the harness default applies later', () => {
		writeDef('minimal', '---\nname: minimal\n---\n\nDo the thing.\n')
		const def = resolveAgentDef({ name: 'minimal', cwd })
		expect(def.model).toBeUndefined()
		expect(def.harness).toBeUndefined()
		expect(def.instructions).toBe('Do the thing.')
	})

	it('falls back to the file stem as name when frontmatter omits name', () => {
		writeDef('stem-name', '---\nmodel: sonnet\n---\n\nBody.\n')
		const def = resolveAgentDef({ name: 'stem-name', cwd })
		expect(def.name).toBe('stem-name')
	})

	it('an unresolvable name throws a clear error', () => {
		expect(() => resolveAgentDef({ name: 'ghost', cwd })).toThrow(/no agent definition named "ghost"/)
	})

	it('a nonexistent --file throws a clear error', () => {
		expect(() => resolveAgentDef({ file: join(cwd, 'nope.md') })).toThrow(/does not exist/)
	})

	it('throws when neither name nor file is given', () => {
		expect(() => resolveAgentDef({})).toThrow(/needs a --agent/)
	})

	it('checks searchRoots ahead of the project .agents/agents/ convention', () => {
		const extra = mkdtempSync(join(tmpdir(), 'cl-extra-'))
		writeDef('shared', '---\nmodel: opus\n---\n\nFrom extra root.\n', extra)
		const def = resolveAgentDef({ name: 'shared', cwd, searchRoots: [extra] })
		expect(def.instructions).toBe('From extra root.')
	})
})

describe('listAgentDefs', () => {
	it('lists every .md def under .agents/agents/', () => {
		writeDef('a', '---\nmodel: sonnet\n---\n\nA.\n')
		writeDef('b', '---\nmodel: opus\n---\n\nB.\n')
		const defs = listAgentDefs({ cwd })
		expect(defs.map((d) => d.name).sort()).toEqual(['a', 'b'])
	})

	it('returns a definitive empty array when the dir is absent', () => {
		const emptyCwd = mkdtempSync(join(tmpdir(), 'cl-empty-'))
		expect(listAgentDefs({ cwd: emptyCwd })).toEqual([])
	})

	it('returns a definitive empty array when the dir exists but has no defs', () => {
		expect(listAgentDefs({ cwd })).toEqual([])
	})
})
