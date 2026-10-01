import { describe, expect, it } from 'vitest'
import { parseCursorModels } from './cursor-models.ts'

describe('parseCursorModels', () => {
	it('takes the id from each `<id> - <name>` line', () => {
		const out =
			'Available models\n\nauto - Auto\nclaude-opus-5-high - Claude Opus 5 High (current)\ngpt-5.3-codex-xhigh - GPT-5.3 Codex XHigh\n'
		expect(parseCursorModels(out)).toEqual(
			expect.arrayContaining(['auto', 'claude-opus-5-high', 'gpt-5.3-codex-xhigh']),
		)
	})

	it('strips ANSI colour and list bullets before reading the id', () => {
		expect(parseCursorModels('\x1b[1m- gpt-5.2\x1b[0m  GPT-5.2\n* gpt-5.2-high\n')).toEqual(['gpt-5.2', 'gpt-5.2-high'])
	})

	it('reads nothing from empty output', () => {
		expect(parseCursorModels('')).toEqual([])
	})
})
