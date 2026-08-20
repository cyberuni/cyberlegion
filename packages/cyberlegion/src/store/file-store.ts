import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { ensureMarker, paths } from '../paths.ts'
import { CorruptRecordError } from './errors.ts'
import type { AgentRecord, InboxSnapshot, Message, Store } from './store.ts'

/** Parse a record file's content, wrapping a `JSON.parse` failure in a typed, file-named
 * `CorruptRecordError` instead of letting a bare `SyntaxError` bubble up from deep inside
 * `listInbox`/`listAgents`/`getAgent` with no indication of WHICH file broke. A file that doesn't
 * exist is a caller error — callers check existence first, so this only ever sees files known to
 * be present but possibly torn (a crash mid-write predating the atomic-write fix, or on-disk
 * tampering) — see evidence.md item 5, "no silent success on a broken store". */
function readJsonRecord<T>(file: string): T {
	const raw = readFileSync(file, 'utf8')
	try {
		return JSON.parse(raw) as T
	} catch (err) {
		throw new CorruptRecordError(file, err)
	}
}

function readMessages(dir: string): Message[] {
	if (!existsSync(dir)) return []
	return readdirSync(dir)
		.filter((f) => f.endsWith('.json'))
		.map((f) => readJsonRecord<Message>(join(dir, f)))
}

/** Write `data` to `file` crash-safely: write to a sibling temp file first, then `renameSync` into
 * place. `rename` is atomic within a filesystem (POSIX guarantees this; Node's Win32 rename is too
 * for same-volume paths, which every path here is — always under the same store root), so any
 * reader either sees the OLD complete content or the NEW complete content, never a truncated
 * in-between. Before this fix, `putMessage`/`putAgent`/`putPaneIndex`/`setMainPane` called
 * `writeFileSync` directly on the final path — only `ackMessage`'s move (a rename of an already-
 * complete file) was atomic. A process crashing mid-`writeFileSync`, or a reader racing a writer on
 * a large record, could hand `JSON.parse` a truncated file and throw an uncaught `SyntaxError` deep
 * inside `listInbox`/`listAgents`/`getAgent`.
 *
 * Deliberately no `fsync` before the rename: this tool defends against a process CRASHING mid-write
 * (the actual, observed risk in a daemonless multi-process CLI), where the page cache alone is
 * sufficient, not against a power-loss/OS-crash losing unflushed pages, which cyberlegion doesn't
 * claim to survive today (no writer here holds data the user can't just re-send). Add fsync if that
 * durability bar ever changes.
 *
 * The temp name embeds pid + a counter so two writers to the SAME final path never collide on their
 * own temp files mid-write (each writer's temp file is unique to it). */
let tmpCounter = 0
function writeFileAtomic(file: string, data: string | Buffer): void {
	mkdirSync(dirname(file), { recursive: true })
	const tmp = `${file}.${process.pid}.${tmpCounter++}.tmp`
	writeFileSync(tmp, data)
	renameSync(tmp, file)
}

function writeJson(file: string, data: unknown): void {
	writeFileAtomic(file, `${JSON.stringify(data, null, 2)}\n`)
}

function writeText(file: string, text: string): void {
	writeFileAtomic(file, text)
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
		writeFileAtomic(join(dir, `${msg.id}.json`), `${JSON.stringify(msg, null, 2)}\n`)
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
		const msg = readJsonRecord<Message>(src)
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
		return readJsonRecord<AgentRecord>(file)
	}

	listAgents(): AgentRecord[] {
		const dir = paths.agentsDir(this.root)
		if (!existsSync(dir)) return []
		return readdirSync(dir)
			.filter((f) => f.endsWith('.json'))
			.map((f) => readJsonRecord<AgentRecord>(join(dir, f)))
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
