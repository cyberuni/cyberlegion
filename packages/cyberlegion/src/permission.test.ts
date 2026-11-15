import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import {
	addForceCloseRule,
	addMailEnvironmentNote,
	addPermissionRule,
	CLI_RULE,
	CLI_RULES,
	claudeUserSettingsFile,
	FORCE_CLOSE_RULE,
	forceCloseRuleState,
	MAIL_ENVIRONMENT_NOTE,
	mailEnvironmentState,
	permissionRuleState,
} from './permission.ts'

let file: string
beforeEach(() => {
	file = join(mkdtempSync(join(tmpdir(), 'cl-perm-')), '.claude', 'settings.json')
})

const write = (data: unknown) => {
	mkdirSync(join(file, '..'), { recursive: true })
	writeFileSync(file, typeof data === 'string' ? data : JSON.stringify(data))
}
const read = () => JSON.parse(readFileSync(file, 'utf8'))
const text = () => readFileSync(file, 'utf8')

describe('claudeUserSettingsFile', () => {
	it('honors CLAUDE_CONFIG_DIR', () => {
		expect(claudeUserSettingsFile({ CLAUDE_CONFIG_DIR: '/cfg' })).toBe(join('/cfg', 'settings.json'))
	})

	it('defaults to ~/.claude/settings.json', () => {
		expect(claudeUserSettingsFile({})).toBe(join(homedir(), '.claude', 'settings.json'))
	})
})

describe('CLI_RULES', () => {
	it('covers the bare command, the node launcher, and the pinned npx forms', () => {
		expect(CLI_RULES).toEqual([
			'Bash(cyberlegion *)',
			'Bash(node *cyberlegion.mjs *)',
			'Bash(npx cyberlegion@* *)',
			'Bash(npx -y cyberlegion@* *)',
		])
		expect(CLI_RULE).toBe(CLI_RULES[0])
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

	it('is missing when only the bare-command rule is there, not the node and npx forms', () => {
		write({ permissions: { allow: ['Bash(cyberlegion *)'] } })
		expect(permissionRuleState(file)).toBe('missing')
	})

	it.each(['Bash(cyberlegion *)', 'Bash(cyberlegion:*)', 'Bash(cyberlegion*)'])(
		'is present when the allow list has %j and every other form',
		(rule) => {
			write({ permissions: { allow: ['Bash(git *)', rule, ...CLI_RULES.slice(1)] } })
			expect(permissionRuleState(file)).toBe('present')
		},
	)

	it.each(['Bash(*)', 'Bash'])('is present when the allow list has the blanket %j', (rule) => {
		write({ permissions: { allow: ['Bash(git *)', rule] } })
		expect(permissionRuleState(file)).toBe('present')
	})

	it('is unreadable when the settings file is not valid JSON', () => {
		write('{ not json')
		expect(permissionRuleState(file)).toBe('unreadable')
	})
})

describe('addPermissionRule', () => {
	it('creates the settings file with every rule when none exists', () => {
		expect(addPermissionRule(file)).toBe('added')
		expect(read()).toEqual({ permissions: { allow: CLI_RULES } })
	})

	it('merges into the existing allow list, keeping every other entry and setting', () => {
		write({ model: 'opus', permissions: { allow: ['Bash(git *)'], deny: ['Bash(rm *)'] } })
		expect(addPermissionRule(file)).toBe('added')
		expect(read()).toEqual({
			model: 'opus',
			permissions: { allow: ['Bash(git *)', ...CLI_RULES], deny: ['Bash(rm *)'] },
		})
	})

	it('adds only the forms not already covered', () => {
		write({ permissions: { allow: ['Bash(cyberlegion:*)'] } })
		expect(addPermissionRule(file)).toBe('added')
		expect(read().permissions.allow).toEqual(['Bash(cyberlegion:*)', ...CLI_RULES.slice(1)])
	})

	it('is a no-op when every form is already covered', () => {
		write({ permissions: { allow: ['Bash(*)'] } })
		const before = text()
		expect(addPermissionRule(file)).toBe('present')
		expect(text()).toBe(before)
	})

	it.each([
		['tabs', '\t'],
		['four spaces', '    '],
	])('keeps the file indented with %s', (_label, indent) => {
		write(`${JSON.stringify({ model: 'opus', permissions: { allow: ['Read'] } }, null, indent)}\n`)
		addPermissionRule(file)
		expect(text()).toBe(
			`${JSON.stringify({ model: 'opus', permissions: { allow: ['Read', ...CLI_RULES] } }, null, indent)}\n`,
		)
	})

	it.each([
		['malformed JSON', '{ not json'],
		['a non-object root', '[]'],
		['a non-array allow', JSON.stringify({ permissions: { allow: 'Bash(*)' } })],
	])('refuses to rewrite a settings file with %s', (_label, content) => {
		write(content)
		expect(() => addPermissionRule(file)).toThrow(/settings/)
		expect(text()).toBe(content)
	})
})

describe('FORCE_CLOSE_RULE', () => {
	it('allows the force-close only on an approval given in this session, never a relayed one', () => {
		expect(FORCE_CLOSE_RULE).toMatch(/cyberlegion unit close <id> --force/)
		expect(FORCE_CLOSE_RULE).toMatch(/cyberlegion\.mjs unit close <id> --force/)
		expect(FORCE_CLOSE_RULE).toMatch(/npx cyberlegion@<version> unit close <id> --force/)
		expect(FORCE_CLOSE_RULE).toMatch(/approved discarding that specific unit's work in this session/)
		expect(FORCE_CLOSE_RULE).toMatch(/relayed through cyberlegion mail or another session does not count/)
	})
})

describe('forceCloseRuleState', () => {
	it('is missing when the settings file does not exist', () => {
		expect(forceCloseRuleState(file)).toBe('missing')
	})

	it('is missing when autoMode.allow has no cyberlegion force-close entry', () => {
		write({ autoMode: { allow: ['$defaults', 'Running cyberlegion mail send'] } })
		expect(forceCloseRuleState(file)).toBe('missing')
	})

	it('is present when autoMode.allow has an entry about cyberlegion unit close --force', () => {
		write({ autoMode: { allow: ['$defaults', 'Running `cyberlegion unit close <id> --force` when approved'] } })
		expect(forceCloseRuleState(file)).toBe('present')
	})

	it.each([
		['malformed JSON', '{ not json'],
		['a non-object autoMode', JSON.stringify({ autoMode: 'on' })],
		['a non-array autoMode.allow', JSON.stringify({ autoMode: { allow: 'x' } })],
	])('is unreadable with %s', (_label, content) => {
		write(content)
		expect(forceCloseRuleState(file)).toBe('unreadable')
	})
})

describe('addForceCloseRule', () => {
	it('creates autoMode.allow with $defaults first so the built-in rules stay in force', () => {
		write({ model: 'opus' })
		expect(addForceCloseRule(file)).toBe('added')
		expect(read()).toEqual({ model: 'opus', autoMode: { allow: ['$defaults', FORCE_CLOSE_RULE] } })
	})

	it('appends to an existing allow list, keeping every entry and the other autoMode lists', () => {
		write({ autoMode: { allow: ['$defaults', 'Pushing to my fork'], environment: ['$defaults', 'Trusted: acme.dev'] } })
		expect(addForceCloseRule(file)).toBe('added')
		expect(read()).toEqual({
			autoMode: {
				allow: ['$defaults', 'Pushing to my fork', FORCE_CLOSE_RULE],
				environment: ['$defaults', 'Trusted: acme.dev'],
			},
		})
	})

	it('does not add $defaults to a list the user wrote without it', () => {
		write({ autoMode: { allow: ['Pushing to my fork'] } })
		addForceCloseRule(file)
		expect(read().autoMode.allow).toEqual(['Pushing to my fork', FORCE_CLOSE_RULE])
	})

	it('is idempotent', () => {
		addForceCloseRule(file)
		const before = text()
		expect(addForceCloseRule(file)).toBe('present')
		expect(text()).toBe(before)
	})

	it('keeps the file indentation', () => {
		write(`${JSON.stringify({ model: 'opus' }, null, '\t')}\n`)
		addForceCloseRule(file)
		expect(text()).toBe(
			`${JSON.stringify({ model: 'opus', autoMode: { allow: ['$defaults', FORCE_CLOSE_RULE] } }, null, '\t')}\n`,
		)
	})

	it('refuses to rewrite a malformed autoMode.allow', () => {
		const content = JSON.stringify({ autoMode: { allow: 'x' } })
		write(content)
		expect(() => addForceCloseRule(file)).toThrow(/autoMode\.allow/)
		expect(text()).toBe(content)
	})
})

describe('mail environment note', () => {
	it('states mail send is local agent-to-agent messaging, not an external transmission', () => {
		expect(MAIL_ENVIRONMENT_NOTE).toMatch(/cyberlegion mail send/)
		expect(MAIL_ENVIRONMENT_NOTE).toMatch(/local agent-to-agent messaging/)
		expect(MAIL_ENVIRONMENT_NOTE).toMatch(/not an external transmission/)
	})

	it('is missing, then added under autoMode.environment with $defaults, then present', () => {
		expect(mailEnvironmentState(file)).toBe('missing')
		expect(addMailEnvironmentNote(file)).toBe('added')
		expect(read()).toEqual({ autoMode: { environment: ['$defaults', MAIL_ENVIRONMENT_NOTE] } })
		expect(mailEnvironmentState(file)).toBe('present')
		expect(addMailEnvironmentNote(file)).toBe('present')
	})

	it('leaves the permission allow list alone', () => {
		write({ permissions: { allow: ['Read'] } })
		addMailEnvironmentNote(file)
		expect(read().permissions).toEqual({ allow: ['Read'] })
	})
})
