#!/usr/bin/env node
import { resolve } from 'node:path'
import { Command, Option } from 'commander'
import { migrateStore } from './admin.ts'
import { selectSessionAdapter } from './console/index.ts'
import { decommission } from './decommission.ts'
import {
	bumpLastSeen,
	detectHarness,
	type Harness,
	type IdContext,
	listAgents,
	loadAgent,
	prune,
	realExec,
	register,
	resolveAgent,
	resolveSelfId,
	touch,
} from './identity.ts'
import { install } from './install.ts'
import { ack, inbox, peek, resolveBody, send } from './message.ts'
import { emit, type Format, fail, nextStep, toonList, toonObject } from './output.ts'
import { resolveRoot } from './paths.ts'
import { injectInbox } from './runtime/inject-inbox.ts'
import { spawn } from './session.ts'
import { FileStore } from './store/file-store.ts'

// cyberlegion — the CLI is pure mechanism (dumb hands a routing layer composes). Routing
// (warm-peer vs cold-subagent vs run-inline) is never decided here. Command groups:
//   identity · session · mail · dispatch · agent · admin

const VERSION = '0.0.0'

interface GlobalOpts {
	space?: string
	format?: string
}

function ctxOf(opts: GlobalOpts): IdContext {
	const store = new FileStore(resolveRoot({ space: opts.space }))
	return { store, env: process.env }
}

function formatOf(opts: GlobalOpts): Format {
	return opts.format === 'json' ? 'json' : 'toon'
}

function requireSelf(ctx: IdContext): string {
	const id = resolveSelfId(ctx)
	if (!id) fail('no identity in this session — run `cyberlegion identity register` first')
	bumpLastSeen(ctx, id)
	return id
}

function resolveTarget(ctx: IdContext, ref: string): { id: string } {
	const agent = resolveAgent(ctx.store, ref)
	const pane = agent.tmux?.pane ?? ctx.store.findPaneByAgentId(agent.id)
	if (!pane) fail(`unit "${ref}" has no known session pane`)
	return { id: pane }
}

function withGlobals(cmd: Command): Command {
	return cmd
		.option('--space <path>', 'isolate the hub root (overrides the global hub / $CYBERLEGION_ROOT)')
		.addOption(new Option('--format <format>', 'output format').choices(['toon', 'json']).default('toon'))
}

const program = new Command()
program
	.name('cyberlegion')
	.description('Harness-agnostic agent session spawning, messaging, and dispatch over the filesystem')
	.version(VERSION)

// -------------------------------------------------------------------------------------------
// identity — self-identify and discover peers
// -------------------------------------------------------------------------------------------
const identity = program.command('identity').description('self-identify and discover peers')

withGlobals(identity.command('register'))
	.description('register or refresh this session identity')
	.option('--handle <name>', 'human handle for this agent')
	.option('--harness <h>', 'claude | cursor | codex (else auto-detected)')
	.action((opts) => {
		const ctx = ctxOf(opts)
		const rec = register(ctx, { handle: opts.handle, harness: opts.harness })
		emit(formatOf(opts), {
			toon: toonObject({ id: rec.id, handle: rec.handle, harness: rec.harness, status: rec.status }),
			json: rec,
		})
	})

withGlobals(identity.command('whoami'))
	.description('print this session own identity')
	.action((opts) => {
		const ctx = ctxOf(opts)
		const id = resolveSelfId(ctx)
		if (!id) fail('no identity in this session — run `cyberlegion identity register` first')
		const rec = loadAgent(ctx.store, id)
		if (!rec) fail(`registered self id "${id}" has no agent record`)
		emit(formatOf(opts), {
			toon: toonObject({ id: rec.id, handle: rec.handle, harness: rec.harness, status: rec.status }),
			json: rec,
		})
	})

function runWho(opts: GlobalOpts & { all?: boolean }): void {
	const ctx = ctxOf(opts)
	touch(ctx)
	const agents = listAgents(ctx.store).filter((a) => opts.all || a.status !== 'exited')
	emit(formatOf(opts), {
		toon: toonList(
			'agents',
			agents,
			[
				{ key: 'id', get: (a) => a.id },
				{ key: 'handle', get: (a) => a.handle },
				{ key: 'harness', get: (a) => a.harness },
				{ key: 'status', get: (a) => a.status },
			],
			`${agents.length} agents`,
		),
		json: agents,
	})
	if (agents.length === 0) nextStep('cyberlegion identity register to join')
}

withGlobals(identity.command('who'))
	.description('list the addressable peers')
	.option('--all', 'include exited agents')
	.action(runWho)

withGlobals(identity.command('prune'))
	.description('mark dead agents exited and sweep')
	.action((opts) => {
		const ctx = ctxOf(opts)
		touch(ctx)
		const changed = prune(ctx)
		emit(formatOf(opts), {
			toon: toonList(
				'pruned',
				changed,
				[
					{ key: 'id', get: (a) => a.id },
					{ key: 'handle', get: (a) => a.handle },
				],
				`${changed.length} pruned`,
			),
			json: changed,
		})
	})

// -------------------------------------------------------------------------------------------
// session — warm peer session lifecycle over a multiplexer
// -------------------------------------------------------------------------------------------
const session = program.command('session').description('warm peer session lifecycle over a multiplexer')

function defineSpawn(cmd: Command): Command {
	return withGlobals(cmd)
		.description('launch a new peer session in its own git worktree (tmux or herdr)')
		.requiredOption('--harness <h>', 'claude | cursor | codex')
		.option('--task <text>', 'brief text, or - for stdin')
		.option('--brief-file <path>', 'read the brief from a file')
		.option('--handle <name>', 'handle for the new peer')
		.option('--branch <name>', 'branch for the new worktree (default cyberlegion/unit-<id>)')
		.option('--worktree-path <path>', 'where to check out the new worktree')
		.addOption(
			new Option('--at <placement>', 'where to open the new session')
				.choices(['pane:right', 'pane:down', 'tab', 'window'])
				.default('pane:right'),
		)
		.action((opts) => {
			const ctx = ctxOf(opts)
			touch(ctx)
			const res = spawn(ctx, {
				harness: opts.harness,
				task: opts.task,
				briefFile: opts.briefFile,
				handle: opts.handle,
				branch: opts.branch,
				worktreePath: opts.worktreePath,
				at: opts.at,
			})
			emit(formatOf(opts), {
				toon: toonObject({
					spawned: res.agent.id,
					handle: res.agent.handle,
					harness: res.agent.harness,
					worktree: res.agent.worktree?.root,
					pane: res.pane,
				}),
				json: res,
			})
			nextStep(`cyberlegion session read ${res.agent.id}`)
		})
}
defineSpawn(session.command('spawn'))

withGlobals(session.command('close'))
	.description("tear down a unit's worktree + session and reap its state (the inverse of spawn)")
	.argument('<id>', 'unit id, handle, or worktree branch/CR ref')
	.option('--force', 'discard uncommitted changes in the worktree (never overrides refusing the primary checkout)')
	.action((ref, opts) => {
		const ctx = ctxOf(opts)
		touch(ctx)
		const agent = resolveAgent(ctx.store, ref)
		const res = decommission(ctx, { id: agent.id, force: opts.force })
		emit(formatOf(opts), {
			toon: toonObject({ closed: agent.id, worktree: res.worktreeRoot ?? '-', pane: res.pane ?? '-' }),
			json: res,
		})
	})

withGlobals(session.command('list'))
	.description('list live peer sessions')
	.action((opts) => {
		const ctx = ctxOf(opts)
		touch(ctx)
		const agents = listAgents(ctx.store).filter((a) => a.status !== 'exited')
		emit(formatOf(opts), {
			toon: toonList(
				'sessions',
				agents,
				[
					{ key: 'id', get: (a) => a.id },
					{ key: 'handle', get: (a) => a.handle },
					{ key: 'status', get: (a) => a.status },
					{ key: 'pane', get: (a) => a.tmux?.pane ?? '-' },
				],
				`${agents.length} sessions`,
			),
			json: agents,
		})
	})

withGlobals(session.command('focus'))
	.description("move input focus to a peer's session")
	.argument('<ref>', 'unit id, handle, or worktree branch/CR ref')
	.action((ref, opts) => {
		const ctx = ctxOf(opts)
		touch(ctx)
		const target = resolveTarget(ctx, ref)
		selectSessionAdapter(ctx.env ?? process.env).focus(realExec, target)
		emit(formatOf(opts), { toon: toonObject({ focused: ref, pane: target.id }), json: { ref, pane: target.id } })
	})

withGlobals(session.command('nudge'))
	.description("ring a peer's session (a dumb doorbell — the mail is the payload)")
	.argument('<ref>', 'unit id, handle, or worktree branch/CR ref')
	.action((ref, opts) => {
		const ctx = ctxOf(opts)
		touch(ctx)
		const target = resolveTarget(ctx, ref)
		selectSessionAdapter(ctx.env ?? process.env).send(realExec, target, '')
		emit(formatOf(opts), { toon: toonObject({ nudged: ref, pane: target.id }), json: { ref, pane: target.id } })
	})

withGlobals(session.command('read'))
	.description("scrape a peer's session screen")
	.argument('<ref>', 'unit id, handle, or worktree branch/CR ref')
	.option('--lines <n>', 'trailing lines to capture', (v) => Number.parseInt(v, 10))
	.action((ref, opts) => {
		const ctx = ctxOf(opts)
		touch(ctx)
		const target = resolveTarget(ctx, ref)
		const text = selectSessionAdapter(ctx.env ?? process.env).read(realExec, target, { lines: opts.lines })
		if (formatOf(opts) === 'json') {
			console.log(JSON.stringify({ ref, pane: target.id, output: text }, null, 2))
		} else {
			console.log(text)
		}
	})

// -------------------------------------------------------------------------------------------
// mail — durable inter-agent messaging
// -------------------------------------------------------------------------------------------
const mail = program.command('mail').description('durable inter-agent messaging')

function defineSend(cmd: Command): Command {
	return withGlobals(cmd)
		.description('send a message to a peer (by handle or id)')
		.requiredOption('--to <peer>', 'recipient handle or id')
		.option('--from <id>', 'sender id (else this session own identity)')
		.option('--subject <s>', 'subject')
		.option('--body <text>', 'message body')
		.option('--body-file <path>', 'read body from a file, or - for stdin')
		.option('--thread <id>', 'thread id')
		.option('--reply-to <msg>', 'message id this replies to')
		.action((opts) => {
			const ctx = ctxOf(opts)
			const fromId = opts.from ?? requireSelf(ctx)
			const body = resolveBody(opts.body, opts.bodyFile)
			const msg = send(
				{ store: ctx.store },
				{ fromId, to: opts.to, subject: opts.subject, body, thread: opts.thread, replyTo: opts.replyTo },
			)
			emit(formatOf(opts), { toon: toonObject({ sent: msg.id, to: opts.to, subject: msg.subject }), json: msg })
		})
}
defineSend(mail.command('send'))

function runInbox(opts: GlobalOpts & { unread?: boolean; from?: string }): void {
	const ctx = ctxOf(opts)
	touch(ctx)
	const meId = requireSelf(ctx)
	const items = inbox({ store: ctx.store }, { meId, unread: opts.unread, from: opts.from })
	const unreadCount = items.filter((i) => !i.read).length
	emit(formatOf(opts), {
		toon: toonList(
			'messages',
			items,
			[
				{ key: 'id', get: (m) => m.id },
				{ key: 'from', get: (m) => m.fromHandle },
				{ key: 'subject', get: (m) => m.subject ?? '' },
				{ key: 'read', get: (m) => m.read },
			],
			`${items.length} messages (${unreadCount} unread)`,
		),
		json: items,
	})
	const firstUnread = items.find((m) => !m.read)
	if (firstUnread) nextStep(`cyberlegion mail read ${firstUnread.id}`)
}

withGlobals(mail.command('inbox'))
	.description('list your mail')
	.option('--unread', 'only un-acked mail')
	.option('--from <id>', 'filter by sender')
	.action(runInbox)

withGlobals(mail.command('read'))
	.description('peek at a message without acknowledging it')
	.argument('<msg-id>', 'message id')
	.action((msgId, opts) => {
		const ctx = ctxOf(opts)
		const meId = requireSelf(ctx)
		const msg = peek({ store: ctx.store }, meId, msgId)
		if (!msg) fail(`"${msgId}" is not a message in this inbox`)
		emit(formatOf(opts), {
			toon: toonObject({ id: msg.id, from: msg.fromHandle, subject: msg.subject, body: msg.body }),
			json: msg,
		})
		nextStep(`cyberlegion mail ack ${msg.id}`)
	})

withGlobals(mail.command('ack'))
	.description('acknowledge a message (moves it out of the unread set)')
	.argument('<msg-id>', 'message id')
	.action((msgId, opts) => {
		const ctx = ctxOf(opts)
		const meId = requireSelf(ctx)
		const msg = ack({ store: ctx.store }, meId, msgId)
		emit(formatOf(opts), { toon: toonObject({ acked: msg.id, from: msg.fromHandle, subject: msg.subject }), json: msg })
	})

withGlobals(mail.command('hook'))
	.description('emit the harness hook injection payload (raw JSON on stdout, not TOON)')
	.option('--event <event>', 'SessionStart | PostToolUse', 'SessionStart')
	.action((opts) => {
		const ctx = ctxOf(opts)
		touch(ctx)
		const payload = injectInbox(ctx, opts.event)
		if (payload) console.log(JSON.stringify(payload))
	})

// -------------------------------------------------------------------------------------------
// dispatch / agent — registered but empty; wired in a later change request
// -------------------------------------------------------------------------------------------
program.command('dispatch').description('delegate work and await a result (result-slot primitives)')
program.command('agent').description('resolve reusable agent definitions')

// -------------------------------------------------------------------------------------------
// admin — setup and diagnostics
// -------------------------------------------------------------------------------------------
const admin = program.command('admin').description('setup and diagnostics')

withGlobals(admin.command('install'))
	.description('wire the mail-surfacing hook into a harness config')
	.requiredOption('--agent <harness>', 'claude | cursor | codex')
	.option('--dir <path>', 'project dir to write config into', process.cwd())
	.action((opts) => {
		const results = install(opts.agent as Harness, opts.dir)
		emit(formatOf(opts), {
			toon: toonList(
				'hooks',
				results,
				[
					{ key: 'event', get: (r) => r.event },
					{ key: 'status', get: (r) => r.status },
					{ key: 'file', get: (r) => r.file },
				],
				`${results.length} hooks`,
			),
			json: results,
		})
	})

withGlobals(admin.command('doctor'))
	.description('probe harness, multiplexer, hub root, and self-id')
	.action((opts) => {
		const ctx = ctxOf(opts)
		const harness = detectHarness(undefined, ctx) ?? 'unknown'
		let mux = 'none'
		try {
			mux = selectSessionAdapter(ctx.env ?? process.env).name
		} catch {
			// no multiplexer detected — reported as 'none'
		}
		const selfId = resolveSelfId(ctx) ?? '-'
		emit(formatOf(opts), {
			toon: toonObject({ harness, mux, hubRoot: ctx.store.root, selfId }),
			json: { harness, mux, hubRoot: ctx.store.root, selfId },
		})
	})

withGlobals(admin.command('mode'))
	.description('report the detected session-backend mode')
	.action((opts) => {
		let mux = 'none'
		try {
			mux = selectSessionAdapter(process.env).name
		} catch {
			// no multiplexer detected — reported as 'none'
		}
		emit(formatOf(opts), { toon: toonObject({ mode: mux }), json: { mode: mux } })
	})

withGlobals(admin.command('migrate'))
	.description('merge one hub root state into another (e.g. an old project-local root into the global hub)')
	.requiredOption('--from <path>', 'source hub root')
	.requiredOption('--to <path>', 'destination hub root')
	.action((opts) => {
		const from = new FileStore(resolve(opts.from))
		const to = new FileStore(resolve(opts.to))
		const res = migrateStore(from, to)
		emit(formatOf(opts), {
			toon: toonObject({ agents: res.agents, messages: res.messages, briefs: res.briefs }),
			json: res,
		})
	})

// -------------------------------------------------------------------------------------------
// hot-path top-level aliases
// -------------------------------------------------------------------------------------------
defineSpawn(program.command('spawn'))
defineSend(program.command('send'))
withGlobals(program.command('inbox'))
	.description('list your mail (alias of `mail inbox`)')
	.option('--unread', 'only un-acked mail')
	.option('--from <id>', 'filter by sender')
	.action(runInbox)
withGlobals(program.command('who'))
	.description('list the addressable peers (alias of `identity who`)')
	.option('--all', 'include exited agents')
	.action(runWho)

program.parseAsync(process.argv).catch((err: unknown) => {
	console.error(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }))
	process.exit(1)
})
