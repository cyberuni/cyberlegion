#!/usr/bin/env node
import { resolve } from 'node:path'
import { Command, Option } from 'commander'
import { migrateStore } from './admin.ts'
import { realizeLaunch } from './agentdef/realize.ts'
import { type AgentDef, listAgentDefs, resolveAgentDef } from './agentdef/resolve.ts'
import { selectSessionAdapter } from './console/index.ts'
import { currentPane, probeMultiplexer } from './console/mux-probe.ts'
import { decommission } from './decommission.ts'
import { type DispatchResult, DispatchWaitingError, channel as dispatchChannel } from './dispatch/channel.ts'
import { collect as dispatchCollect } from './dispatch/collect.ts'
import { type DispatchEnvelope, prep as dispatchPrep } from './dispatch/prep.ts'
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
	registerStanding,
	resolveAgent,
	resolveSelfId,
	resolveStandingOwner,
	touch,
} from './identity.ts'
import { install } from './install.ts'
import { ack, deleteMessage, inbox, peek, resolveBody, send } from './message.ts'
import { emit, type Format, fail, nextStep, toonList, toonObject } from './output.ts'
import { resolveRoot } from './paths.ts'
import { injectInbox } from './runtime/inject-inbox.ts'
import { spawn } from './session.ts'
import { FileStore } from './store/file-store.ts'
import { awaitReply } from './wake/await.ts'
import { watchMail } from './wake/watch.ts'

// cyberlegion — the CLI is pure mechanism (dumb hands a routing layer composes). Routing
// (warm-peer vs cold-subagent vs run-inline) is never decided here. Command groups (ADR-0024):
//   mux · unit · mail · agent · attach · init · admin · dispatch

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
	if (!id) fail('no identity in this session — run `cyberlegion unit register` first')
	bumpLastSeen(ctx, id)
	return id
}

function resolveTarget(ctx: IdContext, ref: string): { id: string } {
	const agent = resolveAgent(ctx.store, ref)
	const pane = agent.pane?.id ?? ctx.store.findPaneByAgentId(agent.id)
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
	// The program carries --space/--format for the bare-status default action; the same names are
	// declared on every leaf subcommand. Positional options keep a post-verb --space bound to the
	// subcommand (a program option is only recognized before the subcommand token).
	.enablePositionalOptions()

// -------------------------------------------------------------------------------------------
// unit — legion units: register/discover the instance registry, spawn/reap warm sessions
// (identity + session dissolved here, ADR-0024)
// -------------------------------------------------------------------------------------------
const unit = program.command('unit').description('legion units — register, discover, spawn, and reap')

/** The standing-owner branch of `unit register --standing` (folds the old `identity owner`). */
function runStanding(ctx: IdContext, opts: GlobalOpts & { handle?: string }): void {
	if (!opts.handle) {
		const standing = listAgents(ctx.store).filter((a) => a.kind === 'standing')
		emit(formatOf(opts), {
			toon: toonList(
				'agents',
				standing,
				[
					{ key: 'id', get: (a) => a.id },
					{ key: 'handle', get: (a) => a.handle },
					{ key: 'harness', get: (a) => a.harness ?? '-' },
					{ key: 'status', get: (a) => a.status },
				],
				`${standing.length} standing`,
			),
			json: standing,
		})
		return
	}
	const liveClaim = listAgents(ctx.store).find(
		(a) => a.handle === opts.handle && a.kind !== 'standing' && a.status !== 'exited',
	)
	const rec = registerStanding(ctx, { handle: opts.handle })
	if (liveClaim) {
		console.error(`a live session already claims handle "${opts.handle}"`)
	}
	emit(formatOf(opts), {
		toon: toonObject({ id: rec.id, handle: rec.handle, kind: rec.kind, status: rec.status }),
		json: rec,
	})
}

withGlobals(unit.command('register'))
	.description('register or refresh this session identity (or --standing: a session-independent owner inbox)')
	.option('--handle <name>', 'human handle for this agent')
	.option('--harness <h>', 'claude | cursor | codex (else auto-detected)')
	.option('--standing', 'mint a standing, session-independent owner inbox (bare, with no --handle: list them)')
	.action((opts) => {
		const ctx = ctxOf(opts)
		if (opts.standing) {
			runStanding(ctx, opts)
			return
		}
		const rec = register(ctx, { handle: opts.handle, harness: opts.harness })
		emit(formatOf(opts), {
			toon: toonObject({ id: rec.id, handle: rec.handle, harness: rec.harness ?? '-', status: rec.status }),
			json: rec,
		})
	})

withGlobals(unit.command('whoami'))
	.description('print this session own identity')
	.action((opts) => {
		const ctx = ctxOf(opts)
		const id = resolveSelfId(ctx)
		if (!id) fail('no identity in this session — run `cyberlegion unit register` first')
		const rec = loadAgent(ctx.store, id)
		if (!rec) fail(`registered self id "${id}" has no agent record`)
		emit(formatOf(opts), {
			toon: toonObject({ id: rec.id, handle: rec.handle, harness: rec.harness ?? '-', status: rec.status }),
			json: rec,
		})
	})

function runWho(opts: GlobalOpts & { all?: boolean }): void {
	const ctx = ctxOf(opts)
	touch(ctx)
	const agents = listAgents(ctx.store).filter((a) => opts.all || a.status !== 'exited')
	emit(formatOf(opts), {
		toon: toonList(
			'units',
			agents,
			[
				{ key: 'id', get: (a) => a.id },
				{ key: 'handle', get: (a) => a.handle },
				{ key: 'harness', get: (a) => a.harness ?? '-' },
				{ key: 'status', get: (a) => a.status },
				{ key: 'pane', get: (a) => a.pane?.id ?? '-' },
			],
			`${agents.length} units`,
		),
		json: agents,
	})
	if (agents.length === 0) nextStep('cyberlegion unit register to join')
}

withGlobals(unit.command('who'))
	.description('list the addressable units')
	.option('--all', 'include exited units')
	.action(runWho)

withGlobals(unit.command('prune'))
	.description('mark dead units exited and sweep')
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

function defineSpawn(cmd: Command): Command {
	return withGlobals(cmd)
		.description('launch a new peer session in its own git worktree (tmux or herdr)')
		.option('--harness <h>', 'claude | cursor | codex (required unless --agent/--agent-file resolves one)')
		.option('--agent <name>', 'resolve an agent def (.agents/agents/<name>.md) for harness/model/instructions')
		.option('--agent-file <path>', 'read an exact agent def file instead of resolving by name')
		.option('--task <text>', 'brief text, or - for stdin')
		.option('--brief-file <path>', 'read the brief from a file')
		.option('--handle <name>', 'handle for the new peer')
		.option('--branch <name>', 'branch for the new worktree (default cyberlegion/unit-<id>)')
		.option('--worktree-path <path>', 'where to check out the new worktree')
		.option(
			'--cwd <path>',
			'spawn the session in an existing directory; create no worktree (mutually exclusive with --branch/--worktree-path)',
		)
		.addOption(
			new Option('--at <placement>', 'where to open the new session')
				.choices(['pane:right', 'pane:down', 'tab', 'window', 'workspace'])
				.default('pane:right'),
		)
		.action((opts) => {
			const ctx = ctxOf(opts)
			touch(ctx)
			let harness = opts.harness as string | undefined
			let command: string | undefined
			if (opts.agent || opts.agentFile) {
				let def: AgentDef
				try {
					def = resolveAgentDef({ name: opts.agent, file: opts.agentFile })
				} catch (err) {
					fail(err instanceof Error ? err.message : String(err))
				}
				const realized = realizeLaunch(def, { harness: opts.harness as Harness | undefined })
				harness = realized.harness
				command = realized.command
			}
			if (!harness) fail('unit spawn needs --harness, or --agent/--agent-file resolving one')
			const res = spawn(ctx, {
				harness,
				command,
				task: opts.task,
				briefFile: opts.briefFile,
				handle: opts.handle,
				branch: opts.branch,
				worktreePath: opts.worktreePath,
				cwd: opts.cwd,
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
			nextStep(`cyberlegion unit read ${res.agent.id}`)
		})
}
defineSpawn(unit.command('spawn'))

withGlobals(unit.command('close'))
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

withGlobals(unit.command('focus'))
	.description("move input focus to a peer's session")
	.argument('<ref>', 'unit id, handle, or worktree branch/CR ref')
	.action((ref, opts) => {
		const ctx = ctxOf(opts)
		touch(ctx)
		const target = resolveTarget(ctx, ref)
		selectSessionAdapter(ctx.env ?? process.env).focus(realExec, target)
		emit(formatOf(opts), { toon: toonObject({ focused: ref, pane: target.id }), json: { ref, pane: target.id } })
	})

withGlobals(unit.command('nudge'))
	.description("ring a peer's session (a dumb doorbell — the mail is the payload)")
	.argument('<ref>', 'unit id, handle, or worktree branch/CR ref')
	.action((ref, opts) => {
		const ctx = ctxOf(opts)
		touch(ctx)
		const target = resolveTarget(ctx, ref)
		selectSessionAdapter(ctx.env ?? process.env).send(realExec, target, '')
		emit(formatOf(opts), { toon: toonObject({ nudged: ref, pane: target.id }), json: { ref, pane: target.id } })
	})

withGlobals(unit.command('read'))
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

function runInbox(opts: GlobalOpts & { unread?: boolean; from?: string; thread?: string; owner?: string }): void {
	const ctx = ctxOf(opts)
	touch(ctx)
	const meId = opts.owner ? resolveStandingOwner(ctx.store, opts.owner) : requireSelf(ctx)
	const items = inbox({ store: ctx.store }, { meId, unread: opts.unread, from: opts.from, thread: opts.thread })
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
	.option('--thread <id>', 'filter to messages carrying this thread id')
	.option('--owner <handle>', "target a standing owner's mailbox instead of this session's own")
	.action(runInbox)

withGlobals(mail.command('read'))
	.description('peek at a message without acknowledging it')
	.argument('<msg-id>', 'message id')
	.option('--owner <handle>', "peek a standing owner's mailbox instead of this session's own")
	.action((msgId, opts) => {
		const ctx = ctxOf(opts)
		const meId = opts.owner ? resolveStandingOwner(ctx.store, opts.owner) : requireSelf(ctx)
		const msg = peek({ store: ctx.store }, meId, msgId)
		if (!msg) fail(`"${msgId}" is not a message in this inbox`)
		emit(formatOf(opts), {
			toon: toonObject({ id: msg.id, from: msg.fromHandle, subject: msg.subject, body: msg.body }),
			json: msg,
		})
		nextStep(`cyberlegion mail ack ${msg.id}${opts.owner ? ` --owner ${opts.owner}` : ''}`)
	})

withGlobals(mail.command('ack'))
	.description('acknowledge a message (moves it out of the unread set)')
	.argument('<msg-id>', 'message id')
	.option('--owner <handle>', "ack a standing owner's mailbox instead of this session's own")
	.action((msgId, opts) => {
		const ctx = ctxOf(opts)
		const meId = opts.owner ? resolveStandingOwner(ctx.store, opts.owner) : requireSelf(ctx)
		const msg = ack({ store: ctx.store }, meId, msgId)
		emit(formatOf(opts), { toon: toonObject({ acked: msg.id, from: msg.fromHandle, subject: msg.subject }), json: msg })
	})

withGlobals(mail.command('delete'))
	.description('permanently remove a message from your inbox (unread or already-acked)')
	.argument('<msg-id>', 'message id')
	.action((msgId, opts) => {
		const ctx = ctxOf(opts)
		const meId = requireSelf(ctx)
		deleteMessage({ store: ctx.store }, meId, msgId)
		emit(formatOf(opts), { toon: toonObject({ deleted: msgId }), json: { deleted: msgId } })
	})

withGlobals(mail.command('await'))
	.description('block until a thread-correlated reply arrives, print it, and ack it')
	.requiredOption('--thread <id>', 'thread id to wait on')
	.option('--from <h>', 'only match a reply from this sender')
	.option(
		'--timeout <ms>',
		'give up after this many ms with no match (0 = wait forever); exits non-zero on timeout',
		(v) => Number.parseInt(v, 10),
		600_000,
	)
	.option(
		'--max-wait <s>',
		'self-cap for one internal poll cycle, in seconds — returns the clean "waiting" sentinel ' +
			'at this cap so the caller can re-arm rather than blocking past a harness tool-timeout',
		(v) => Number.parseInt(v, 10),
		240,
	)
	.addHelpText(
		'after',
		'\nThree outcomes:\n' +
			'  matched      — exit 0; the message is printed on stdout and acked (moved out of the unread set).\n' +
			'  waiting      — exit 0; a stderr "waiting" line and nothing on stdout — the per-call --max-wait\n' +
			'                 cap was hit with no match yet; re-run the same command to keep waiting.\n' +
			'  timed-out    — exit 1; a clear stderr message and nothing on stdout — --timeout elapsed with no match.\n',
	)
	.action(async (opts) => {
		const ctx = ctxOf(opts)
		const meId = requireSelf(ctx)
		const outcome = await awaitReply(
			{ store: ctx.store },
			{ meId, thread: opts.thread, from: opts.from, timeoutMs: opts.timeout, maxWaitS: opts.maxWait },
		)
		if (outcome.kind === 'matched') {
			const msg = outcome.message
			emit(formatOf(opts), {
				toon: toonObject({ id: msg.id, from: msg.fromHandle, subject: msg.subject, body: msg.body }),
				json: msg,
			})
			return
		}
		if (outcome.kind === 'waiting') {
			console.error(
				`waiting — no reply on thread "${opts.thread}" within --max-wait ${opts.maxWait}s; re-run to keep waiting`,
			)
			return
		}
		fail(`no reply on thread "${opts.thread}" within ${opts.timeout}ms`)
	})

withGlobals(mail.command('watch'))
	.description('stream new matching mail as it arrives — an observer only, it never acks; Ctrl-C to stop')
	.option('--thread <id>', 'filter to a thread')
	.option('--from <h>', 'filter by sender')
	.action(async (opts) => {
		const ctx = ctxOf(opts)
		const meId = requireSelf(ctx)
		await watchMail({ store: ctx.store }, { meId, thread: opts.thread, from: opts.from }, (msg) => {
			emit(formatOf(opts), {
				toon: toonObject({ id: msg.id, from: msg.fromHandle, subject: msg.subject, body: msg.body }),
				json: msg,
			})
		})
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
// dispatch — result-slot primitives; routing (warm peer vs cold subagent) is never decided here
// -------------------------------------------------------------------------------------------
const dispatch = program.command('dispatch').description('delegate work and await a result (result-slot primitives)')

function definePrepOptions(cmd: Command): Command {
	return withGlobals(cmd)
		.option('--agent <name>', 'resolve an agent def to build the instruction/launch from')
		.option('--agent-file <path>', 'read an exact agent def file instead of resolving by name')
		.option('--role <name>', 'role label folded into the generic instruction when no agent def is given')
		.option('--brief-text <text>', 'brief body text')
		.option('--brief-file <path>', 'read the brief from a file, or - for stdin')
		.option('--verdict-schema <path>', 'JSON schema file (required keys + primitive types) the result must satisfy')
		.option('--thread <id>', 'thread id (defaults to the minted dispatch id)')
}

function dispatchResultFields(r: DispatchResult) {
	return { id: r.id, verdict: r.verdict != null ? JSON.stringify(r.verdict) : undefined, body: r.body, ts: r.ts }
}

definePrepOptions(dispatch.command('prep'))
	.description('allocate an id + brief + result slot and return the envelope — spawns nothing, never invokes Task')
	.action((opts) => {
		const ctx = ctxOf(opts)
		let envelope: DispatchEnvelope
		try {
			envelope = dispatchPrep(
				{ store: ctx.store },
				{
					agent: opts.agent,
					agentFile: opts.agentFile,
					role: opts.role,
					briefText: opts.briefText,
					briefFile: opts.briefFile,
					thread: opts.thread,
				},
			)
		} catch (err) {
			fail(err instanceof Error ? err.message : String(err))
		}
		emit(formatOf(opts), { toon: toonObject({ ...envelope }), json: envelope })
		nextStep(
			`spawn a subagent with the instruction, then \`cyberlegion dispatch collect ${envelope.id}\` — ` +
				`or on the channel path, \`cyberlegion mail await --thread ${envelope.thread}\``,
		)
	})

definePrepOptions(dispatch.command('channel'))
	.description(
		'prep + spawn a peer session + (--wait) await the mail-thread reply — the one CLI-driven convenience ' +
			'(needs --agent or --agent-file to realize the peer launch)',
	)
	.addOption(
		new Option('--at <placement>', 'where to open the new session')
			.choices(['pane:right', 'pane:down', 'tab', 'window', 'workspace'])
			.default('pane:right'),
	)
	.option('--wait', 'block for the mail-thread reply and print the validated result')
	.option(
		'--timeout <ms>',
		'give up after this many ms with no reply (0 = wait forever)',
		(v) => Number.parseInt(v, 10),
		600_000,
	)
	.option(
		'--max-wait <s>',
		'self-cap for one internal poll cycle, in seconds (re-arm by re-running with --wait)',
		(v) => Number.parseInt(v, 10),
		240,
	)
	.action(async (opts) => {
		const ctx = ctxOf(opts)
		touch(ctx)
		let result: DispatchResult | DispatchEnvelope
		try {
			result = await dispatchChannel(ctx, {
				agent: opts.agent,
				agentFile: opts.agentFile,
				role: opts.role,
				briefText: opts.briefText,
				briefFile: opts.briefFile,
				verdictSchema: opts.verdictSchema,
				thread: opts.thread,
				at: opts.at,
				wait: opts.wait,
				timeoutMs: opts.timeout,
				maxWaitS: opts.maxWait,
			})
		} catch (err) {
			if (err instanceof DispatchWaitingError) {
				console.error(err.message)
				return
			}
			fail(err instanceof Error ? err.message : String(err))
		}
		if ('ts' in result) {
			emit(formatOf(opts), { toon: toonObject(dispatchResultFields(result)), json: result })
			return
		}
		emit(formatOf(opts), { toon: toonObject({ ...result }), json: result })
		nextStep(`cyberlegion mail await --thread ${result.thread} to collect the reply later`)
	})

withGlobals(dispatch.command('collect'))
	.description("read + validate a subagent's result file (the subagent path's counterpart to mail await)")
	.argument('<id>', 'dispatch id')
	.option('--verdict-schema <path>', 'JSON schema file the result must satisfy')
	.action((id, opts) => {
		const ctx = ctxOf(opts)
		let result: DispatchResult
		try {
			result = dispatchCollect({ store: ctx.store }, id, opts.verdictSchema)
		} catch (err) {
			fail(err instanceof Error ? err.message : String(err))
		}
		emit(formatOf(opts), { toon: toonObject(dispatchResultFields(result)), json: result })
	})

// -------------------------------------------------------------------------------------------
// agent — resolve reusable agent definitions (.agents/agents/*.md)
// -------------------------------------------------------------------------------------------
const agent = program.command('agent').description('resolve reusable agent definitions')

const INSTRUCTIONS_PREVIEW_LEN = 200

function truncated(text: string, full?: boolean): string {
	if (full || text.length <= INSTRUCTIONS_PREVIEW_LEN) return text
	return `${text.slice(0, INSTRUCTIONS_PREVIEW_LEN)}… (${text.length} chars total, pass --full)`
}

function agentDefFields(d: AgentDef) {
	return {
		name: d.name,
		description: d.description,
		model: d.model ?? '(harness default)',
		effort: d.effort,
		harness: d.harness ?? '(harness default)',
		warm: d.warm ?? false,
		interactive: d.interactive ?? false,
		path: d.path,
	}
}

withGlobals(agent.command('list'))
	.description('list resolvable agent definitions under .agents/agents/')
	.option('--dir <path>', 'project dir to search from', process.cwd())
	.action((opts) => {
		const defs = listAgentDefs({ cwd: opts.dir })
		emit(formatOf(opts), {
			toon: toonList(
				'defs',
				defs,
				[
					{ key: 'name', get: (d: AgentDef) => d.name },
					{ key: 'model', get: (d: AgentDef) => d.model ?? '-' },
					{ key: 'harness', get: (d: AgentDef) => d.harness ?? '-' },
				],
				`${defs.length} agent definitions`,
			),
			json: defs,
		})
		if (defs.length === 0) nextStep('add a .md file under .agents/agents/ to define one')
	})

withGlobals(agent.command('show'))
	.description('show a resolved agent definition (model/effort/harness/warm/interactive + instructions)')
	.argument('<name>', 'agent def name (file stem under .agents/agents/)')
	.option('--dir <path>', 'project dir to search from', process.cwd())
	.option('--full', 'show the full instructions body (default: truncated)')
	.action((name, opts) => {
		let def: AgentDef
		try {
			def = resolveAgentDef({ name, cwd: opts.dir })
		} catch (err) {
			fail(err instanceof Error ? err.message : String(err))
		}
		emit(formatOf(opts), {
			toon: toonObject({ ...agentDefFields(def), instructions: truncated(def.instructions, opts.full) }),
			json: { ...def, instructions: opts.full ? def.instructions : truncated(def.instructions, opts.full) },
		})
	})

withGlobals(agent.command('resolve'))
	.description('emit the full machine payload for a def — for a routing caller to compose a launch/spawn from')
	.argument('[name]', 'agent def name (omit when passing --file)')
	.option('--file <path>', 'read an exact def file instead of resolving by name (plugin-scoped escape hatch)')
	.option('--dir <path>', 'project dir to search from', process.cwd())
	.action((name, opts) => {
		let def: AgentDef
		try {
			def = resolveAgentDef({ name, file: opts.file, cwd: opts.dir })
		} catch (err) {
			fail(err instanceof Error ? err.message : String(err))
		}
		emit(formatOf(opts), { toon: toonObject(agentDefFields(def)), json: def })
	})

withGlobals(agent.command('path'))
	.description('print the resolved def file path')
	.argument('<name>', 'agent def name (file stem under .agents/agents/)')
	.option('--dir <path>', 'project dir to search from', process.cwd())
	.action((name, opts) => {
		let def: AgentDef
		try {
			def = resolveAgentDef({ name, cwd: opts.dir })
		} catch (err) {
			fail(err instanceof Error ? err.message : String(err))
		}
		emit(formatOf(opts), { toon: toonObject({ path: def.path }), json: { path: def.path } })
	})

// -------------------------------------------------------------------------------------------
// mux — the unit-agnostic pane layer: multiplexer detection and diagnostics (ADR-0024)
// -------------------------------------------------------------------------------------------
const mux = program.command('mux').description('the unit-agnostic pane layer — multiplexer detection and diagnostics')

withGlobals(mux.command('doctor'))
	.description('probe harness, multiplexer (ancestry-discovered), hub root, and self-id')
	.action((opts) => {
		const ctx = ctxOf(opts)
		const harness = detectHarness(undefined, ctx) ?? 'unknown'
		const probe = probeMultiplexer(ctx.exec ?? realExec, ctx.env ?? process.env)
		const selfId = resolveSelfId(ctx) ?? '-'
		emit(formatOf(opts), {
			toon: toonObject({ harness, mux: probe.mux, pane: probe.pane, via: probe.via, hubRoot: ctx.store.root, selfId }),
			json: { harness, mux: probe.mux, pane: probe.pane, via: probe.via, hubRoot: ctx.store.root, selfId },
		})
		if (probe.mux !== 'none') {
			nextStep(
				`export CYBERLEGION_MUX=${probe.mux}${probe.pane ? ` CYBERLEGION_MUX_PANE=${probe.pane}` : ''}` +
					' — pin the fast-path, skip ancestry discovery on later calls',
			)
		}
	})

withGlobals(mux.command('mode'))
	.description('report the detected session-backend mode')
	.action((opts) => {
		const ctx = ctxOf(opts)
		let mode = 'none'
		try {
			mode = selectSessionAdapter(ctx.env ?? process.env).name
		} catch {
			// no multiplexer detected — reported as 'none'
		}
		emit(formatOf(opts), { toon: toonObject({ mode }), json: { mode } })
	})

// -------------------------------------------------------------------------------------------
// attach — the human's read-pane: bind (bare) / --clear / --show the hub's single main pane
// (was identity bind-main / main, ADR-0024)
// -------------------------------------------------------------------------------------------
withGlobals(program.command('attach'))
	.description("bind this pane as the hub's main pane (the owner's live presence); --show reads it, --clear unbinds")
	.option('--clear', 'unbind the main pane (a no-op when nothing is bound)')
	.option('--show', 'print the bound main pane instead of binding')
	.action((opts) => {
		const ctx = ctxOf(opts)
		if (opts.show) {
			const pane = ctx.store.getMainPane()
			emit(formatOf(opts), { toon: toonObject({ mainPane: pane ?? 'none' }), json: { mainPane: pane ?? null } })
			return
		}
		if (opts.clear) {
			ctx.store.setMainPane(null)
			emit(formatOf(opts), { toon: toonObject({ mainPane: 'none' }), json: { mainPane: null } })
			return
		}
		const cur = currentPane(ctx.env ?? process.env)
		if (!cur) fail('no multiplexer pane to bind — run this from inside a tmux or herdr pane')
		ctx.store.setMainPane(cur.pane)
		emit(formatOf(opts), { toon: toonObject({ mainPane: cur.pane }), json: { mainPane: cur.pane } })
	})

// -------------------------------------------------------------------------------------------
// admin — hub-state maintenance (multiplexer diagnostics live in mux; install folded into init)
// -------------------------------------------------------------------------------------------
const admin = program.command('admin').description('hub-state maintenance')

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
// init — the onboarding front door: resolve the harness, register the surfacing hook, and point
// at binding the durable owner inbox. init owns hook installation directly (ADR-0024).
// -------------------------------------------------------------------------------------------
withGlobals(program.command('init'))
	.description('resolve this session harness, register the Legion surfacing hook, and advise owner binding')
	.option('--agent <h>', 'claude | cursor | codex (else auto-detected)')
	.option('--dir <path>', 'project dir to write config into', process.cwd())
	.action((opts) => {
		const ctx = ctxOf(opts)
		let harness: Harness
		try {
			const detected = detectHarness(opts.agent, ctx)
			if (!detected) fail('could not detect harness — pass --agent claude|cursor|codex')
			harness = detected
		} catch (err) {
			fail(err instanceof Error ? err.message : String(err))
		}
		const results = install(harness, opts.dir)
		emit(formatOf(opts), {
			toon: toonList(
				'hooks',
				results,
				[
					{ key: 'event', get: (r) => r.event },
					{ key: 'status', get: (r) => r.status },
					{ key: 'file', get: (r) => r.file },
				],
				`harness ${harness}, ${results.length} hooks`,
			),
			json: { harness, hooks: results },
		})
		const hasStandingOwner = listAgents(ctx.store).some((a) => a.kind === 'standing')
		if (!hasStandingOwner) {
			nextStep('cyberlegion unit register --standing --handle legate to mint the durable owner inbox')
			nextStep('cyberlegion attach to bind this pane as the owner live presence')
		}
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
	.option('--thread <id>', 'filter to messages carrying this thread id')
	.action(runInbox)
withGlobals(program.command('who'))
	.description('list the addressable units (alias of `unit who`)')
	.option('--all', 'include exited units')
	.action(runWho)

// -------------------------------------------------------------------------------------------
// bare invocation — content-first compact status (AXI #8): this session's own identity, its
// unread count, and how many units are live. Exit 0, never help+error. Works unregistered.
// -------------------------------------------------------------------------------------------
withGlobals(program).action((opts: GlobalOpts) => {
	const ctx = ctxOf(opts)
	touch(ctx)
	const id = resolveSelfId(ctx)
	const rec = id ? loadAgent(ctx.store, id) : undefined
	const unread = id ? inbox({ store: ctx.store }, { meId: id, unread: true }).length : 0
	const units = listAgents(ctx.store).filter((a) => a.status !== 'exited').length
	emit(formatOf(opts), {
		toon: toonObject({ self: rec?.handle ?? id ?? '-', harness: rec?.harness ?? '-', unread, units }),
		json: { self: rec ? { id: rec.id, handle: rec.handle, harness: rec.harness } : null, unread, units },
	})
	if (!id) nextStep('cyberlegion unit register to join')
	else if (unread > 0) nextStep('cyberlegion mail inbox --unread')
})

program.parseAsync(process.argv).catch((err: unknown) => {
	console.error(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }))
	process.exit(1)
})
