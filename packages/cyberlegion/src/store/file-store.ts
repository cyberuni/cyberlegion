import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { ensureMarker, paths } from '../paths.ts'
import type { AgentRecord, InboxSnapshot, Message, Store } from './store.ts'

function readMessages(dir: string): Message[] {
	if (!existsSync(dir)) return []
	return readdirSync(dir)
		.filter((f) => f.endsWith('.json'))
		.map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as Message)
}

function writeJson(file: string, data: unknown): void {
	mkdirSync(dirname(file), { recursive: true })
	writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`)
}

function writeText(file: string, text: string): void {
	mkdirSync(dirname(file), { recursive: true })
	writeFileSync(file, text)
}

/** The on-disk `Store` implementation — current per-writer sharded `.json` layout (ADR-0020):
 * one file per message/agent, collision-free filenames, ack = atomic rename into `read/`. */
export class FileStore implements Store {
	constructor(public readonly root: string) {}

	ensureMarker(): void {
		ensureMarker(this.root)
	}

	putMessage(toId: string, msg: Message): void {
		const dir = paths.inboxDir(this.root, toId)
		mkdirSync(dir, { recursive: true })
		writeFileSync(join(dir, `${msg.id}.json`), `${JSON.stringify(msg, null, 2)}\n`)
	}

	listInbox(id: string): InboxSnapshot {
		return {
			unread: readMessages(paths.inboxDir(this.root, id)),
			read: readMessages(paths.inboxReadDir(this.root, id)),
		}
	}

	ackMessage(id: string, msgId: string): Message {
		const src = join(paths.inboxDir(this.root, id), `${msgId}.json`)
		if (!existsSync(src)) {
			throw new Error(`"${msgId}" is not an unread message in this inbox`)
		}
		const msg = JSON.parse(readFileSync(src, 'utf8')) as Message
		const dir = paths.inboxReadDir(this.root, id)
		mkdirSync(dir, { recursive: true })
		renameSync(src, join(dir, `${msgId}.json`))
		return msg
	}

	removeMessage(id: string, msgId: string): void {
		const unreadFile = join(paths.inboxDir(this.root, id), `${msgId}.json`)
		if (existsSync(unreadFile)) {
			rmSync(unreadFile)
			return
		}
		const readFile = join(paths.inboxReadDir(this.root, id), `${msgId}.json`)
		if (existsSync(readFile)) {
			rmSync(readFile)
			return
		}
		throw new Error(`"${msgId}" is not a message in this inbox`)
	}

	putAgent(rec: AgentRecord): void {
		writeJson(paths.agentFile(this.root, rec.id), rec)
	}

	getAgent(id: string): AgentRecord | undefined {
		const file = paths.agentFile(this.root, id)
		if (!existsSync(file)) return undefined
		return JSON.parse(readFileSync(file, 'utf8')) as AgentRecord
	}

	listAgents(): AgentRecord[] {
		const dir = paths.agentsDir(this.root)
		if (!existsSync(dir)) return []
		return readdirSync(dir)
			.filter((f) => f.endsWith('.json'))
			.map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as AgentRecord)
			.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
	}

	removeAgent(id: string): void {
		rmSync(paths.agentFile(this.root, id), { force: true })
	}

	removeAgentData(id: string): void {
		rmSync(paths.dataDir(this.root, id), { recursive: true, force: true })
	}

	putPaneIndex(pane: string, agentId: string): void {
		writeText(paths.paneFile(this.root, pane), agentId)
	}

	resolvePaneId(pane: string): string | undefined {
		const file = paths.paneFile(this.root, pane)
		return existsSync(file) ? readFileSync(file, 'utf8').trim() : undefined
	}

	findPaneByAgentId(agentId: string): string | undefined {
		const dir = paths.panesDir(this.root)
		if (!existsSync(dir)) return undefined
		for (const f of readdirSync(dir)) {
			if (!f.endsWith('.id')) continue
			if (readFileSync(join(dir, f), 'utf8').trim() === agentId) return f.slice(0, -'.id'.length)
		}
		return undefined
	}

	removePaneIndex(pane: string): void {
		rmSync(paths.paneFile(this.root, pane), { force: true })
	}

	writeBrief(agentId: string, text: string): void {
		writeText(paths.briefFile(this.root, agentId), text)
	}

	readBrief(agentId: string): string | undefined {
		const file = paths.briefFile(this.root, agentId)
		return existsSync(file) ? readFileSync(file, 'utf8') : undefined
	}

	setMainPane(pane: string | null): void {
		const file = paths.mainPaneFile(this.root)
		if (pane) {
			writeText(file, pane)
			return
		}
		rmSync(file, { force: true })
	}

	getMainPane(): string | undefined {
		const file = paths.mainPaneFile(this.root)
		return existsSync(file) ? readFileSync(file, 'utf8').trim() : undefined
	}
}
