import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { addPermissionRule, CLI_RULE, claudeUserSettingsFile, permissionRuleState } from './permission.ts'

let file: string
beforeEach(() => {
	file = join(mkdtempSync(join(tmpdir(), 'cl-perm-')), '.claude', 'settings.json')
})

const write = (data: unknown) => {
	mkdirSync(join(file, '..'), { recursive: true })
	writeFileSync(file, typeof data === 'string' ? data : JSON.stringify(data))
}
const read = () => JSON.parse(readFileSync(file, 'utf8'))

describe('claudeUserSettingsFile', () => {
	it('honors CLAUDE_CONFIG_DIR', () => {
		expect(claudeUserSettingsFile({ CLAUDE_CONFIG_DIR: '/cfg' })).toBe(join('/cfg', 'settings.json'))
	})

	it('defaults to ~/.claude/settings.json', () => {
		expect(claudeUserSettingsFile({})).toBe(join(homedir(), '.claude', 'settings.json'))
	})
})

describe('permissionRuleState', () => {
	it('is missing when the settings file does not exist', () => {
		expect(permissionRuleState(file)).toBe('missing')
	})

	it('is missing when no allow rule covers cyberlegion', () => {
		write({ permissions: { allow: ['Bash(git *)', 'Bash(cyberlegion)', 'Read'] } })
		expect(permissionRuleState(file)).toBe('missing')
	})

	it.each(['Bash(cyberlegion *)', 'Bash(cyberlegion:*)', 'Bash(cyberlegion*)', 'Bash(*)', 'Bash'])(
		'is present when the allow list has %j',
		(rule) => {
			write({ permissions: { allow: ['Bash(git *)', rule] } })
			expect(permissionRuleState(file)).toBe('present')
		},
	)

	it('is unreadable when the settings file is not valid JSON', () => {
		write('{ not json')
		expect(permissionRuleState(file)).toBe('unreadable')
	})
})

describe('addPermissionRule', () => {
	it('creates the settings file with the rule when none exists', () => {
		expect(addPermissionRule(file)).toBe('added')
		expect(read()).toEqual({ permissions: { allow: [CLI_RULE] } })
	})

	it('merges into the existing allow list, keeping every other entry and setting', () => {
		write({ model: 'opus', permissions: { allow: ['Bash(git *)'], deny: ['Bash(rm *)'] } })
		expect(addPermissionRule(file)).toBe('added')
		expect(read()).toEqual({
			model: 'opus',
			permissions: { allow: ['Bash(git *)', CLI_RULE], deny: ['Bash(rm *)'] },
		})
	})

	it('is a no-op when a covering rule is already present', () => {
		write({ permissions: { allow: ['Bash(cyberlegion:*)'] } })
		const before = readFileSync(file, 'utf8')
		expect(addPermissionRule(file)).toBe('present')
		expect(readFileSync(file, 'utf8')).toBe(before)
	})

	it.each([
		['malformed JSON', '{ not json'],
		['a non-object root', '[]'],
		['a non-array allow', JSON.stringify({ permissions: { allow: 'Bash(*)' } })],
	])('refuses to rewrite a settings file with %s', (_label, content) => {
		write(content)
		expect(() => addPermissionRule(file)).toThrow(/settings/)
		expect(readFileSync(file, 'utf8')).toBe(content)
	})
})
