import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Exec, IdContext } from '../identity.ts'
import { send } from '../message.ts'
import { FileStore } from '../store/file-store.ts'
import type { AgentRecord } from '../store/store.ts'
import { channel, DispatchWaitingError } from './channel.ts'

let store: FileStore
let primaryRoot: string

const AGENT_DEF = `---
name: reviewer
model: sonnet
harness: claude
---

Review the change.
`

function writeAgentDef(): string {
	const dir = mkdtempSync(join(tmpdir(), 'cl-agentdef-'))
	const path = join(dir, 'reviewer.md')
	writeFileSync(path, AGENT_DEF)
	return path
}

beforeEach(() => {
	store = new FileStore(join(mkdtempSync(join(tmpdir(), 'cl-')), 'hub'))
	primaryRoot = mkdtempSync(join(tmpdir(), 'cl-primary-'))
	const caller: AgentRecord = {
		id: 'caller',
		handle: 'caller',
		harness: 'claude',
		cwd: '/x',
		status: 'active',
		createdAt: '2026-01-01T00:00:00.000Z',
		lastSeen: '2026-01-01T00:00:00.000Z',
	}
	store.putAgent(caller)
})

const fakeExecWithMux: Exec = (cmd, args) => {
	if (cmd === 'git') {
		if (args.includes('--git-common-dir')) return `${primaryRoot}/.git`
		if (args.includes('worktree')) return ''
		return null
	}
	if (args[0] === 'split-window') return '%9'
	if (args[0] === 'send-keys') return null
	return null
}

function ctxWithMux(): IdContext {
	return {
		store,
		env: { TMUX: 't', CYBERLEGION_AGENT_ID: 'caller' },
		exec: fakeExecWithMux,
		now: () => 1_700_000_000_000,
	}
}

describe('channel — the CHANNEL path (mail-on-thread result)', () => {
	it('spawns a peer + returns the validated DispatchResult once the mail-thread reply is already there', async () => {
		// Pre-write the reply on a known thread so awaitReply's very first poll matches — no real
		// sleep needed for this test.
		send(
			{ store, now: () => 1 },
			{ fromId: 'peer', to: 'caller', body: JSON.stringify({ status: 'ok', notes: 'looks good' }), thread: 'cr-1' },
		)

		const result = await channel(ctxWithMux(), {
			agentFile: writeAgentDef(),
			briefText: 'review this',
			thread: 'cr-1',
			wait: true,
		})

		expect('ts' in result && result).toMatchObject({
			verdict: { status: 'ok', notes: 'looks good' },
			body: JSON.stringify({ status: 'ok', notes: 'looks good' }),
		})
	})

	it('without --wait, spawns the peer and returns the envelope (spawns nothing awaited)', async () => {
		const result = await channel(ctxWithMux(), {
			agentFile: writeAgentDef(),
			briefText: 'review this',
			thread: 'cr-2',
		})
		expect('instruction' in result && result.thread).toBe('cr-2')
		// the peer was registered by spawn()
		expect(store.listAgents().some((a) => a.id !== 'caller')).toBe(true)
	})

	it('a verdict failing the schema is an error, not a pass', async () => {
		send(
			{ store, now: () => 1 },
			{ fromId: 'peer', to: 'caller', body: JSON.stringify({ status: 'ok' }), thread: 'cr-3' },
		)
		const schemaDir = mkdtempSync(join(tmpdir(), 'cl-schema-'))
		const schemaFile = join(schemaDir, 'schema.json')
		writeFileSync(schemaFile, JSON.stringify({ required: ['status', 'reviewer'] }))

		await expect(
			channel(ctxWithMux(), {
				agentFile: writeAgentDef(),
				briefText: 'review this',
				thread: 'cr-3',
				wait: true,
				verdictSchema: schemaFile,
			}),
		).rejects.toThrow(/missing required key "reviewer"/)
	})

	it('errors without a mux — never auto-selects a backend', async () => {
		const ctx: IdContext = { store, env: {}, exec: () => null }
		await expect(channel(ctx, { agentFile: writeAgentDef(), briefText: 'review this' })).rejects.toThrow(
			/session backend/,
		)
	})

	it('requires --agent or --agent-file (a channel peer needs a real launch to realize)', async () => {
		await expect(channel(ctxWithMux(), { briefText: 'x' })).rejects.toThrow(/needs --agent/)
	})
})

describe('DispatchWaitingError', () => {
	it('carries the thread and a re-arm hint message', () => {
		const err = new DispatchWaitingError('cr-9')
		expect(err.thread).toBe('cr-9')
		expect(err.message).toMatch(/waiting.*cr-9/)
	})
})
