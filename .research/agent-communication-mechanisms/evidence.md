# Evidence — agent communication mechanisms

## E1. The landscape

### Harness-native

**Claude Code cross-session messaging** (v2.1.224+, macOS/Linux only, not on Bedrock,
Claude Platform on AWS, Google Cloud's Agent Platform, or Microsoft Foundry). Two tools,
`ListAgents` and `SendMessage`. Each session binds a per-session Unix socket, exported to
hooks and Bash as `CLAUDE_CODE_MESSAGING_SOCKET` with a companion
`CLAUDE_CODE_MESSAGING_TOKEN`. Same-machine delivery never touches Anthropic servers;
cross-machine and cloud delivery does.

**Claude Code agent teams** (experimental, `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`). A
lead session plus teammates, coordinating through a shared task list and a per-agent
mailbox at `~/.claude/teams/{team}/inboxes/{agent}.json`. Structured protocol messages
(plan approval, shutdown request) exist but stay inside a team.

**Also native:** channels (push external events into a session), Remote Control (a human
steers a session from another device), agent view (watch and steer many sessions).

**OpenAI Codex** has no shipped equivalent —
[codex#12462](https://github.com/openai/codex/issues/12462) is an open feature request
for inter-agent communication channels.

### Local buses

| Project | Substrate | Notes |
| --- | --- | --- |
| [MCP Agent Mail](https://mcpagentmail.com/) | SQLite + Git, MCP | Identities, threaded messaging, file reservations, search, audit trails. Reported running 40–50 concurrent agents mixing Claude Code, Codex CLI, and Gemini CLI. |
| [agmsg](https://github.com/fujibee/agmsg) | Bash + shared SQLite file | Cross-vendor, no daemon, no network. Driver models: `native`, `bridge`, `rule-file`. |
| [agent-bus](https://github.com/MustaphaSteph/agent-bus) | One SQLite file, MCP, 20 tools | No daemon, no cloud. |
| [cross-agent-teams / xats](https://jtianling.com/en/cross-agent-teams-release.html) | Local MCP daemon | Shared mailbox plus a wake channel; each agent stays in its native CLI. |
| MCP Talk | MCP | Shared message queue across Claude, Codex, Gemini. |

### Filesystem + hook

cyberlegion, cyberfleet, and firstmate. Project-scoped state directories, a CLI as the
only executable surface, and hook-based surfacing. No server, no port, no daemon, no MCP.

### Wire protocols

[A2A](https://en.wikipedia.org/wiki/Agent2Agent) (Google, contributed to the Linux
Foundation in 2026), MCP, ACP (IBM — merged into A2A in 2025), ANP, AGNTCY (Cisco), Agora.

### Different category

[AgentMail](https://www.agentmail.to/) gives an agent a real SMTP inbox — SPF/DKIM/DMARC,
threading, attachments. That is agent-to-**world** communication. It is not a substrate
for sibling agents coordinating inside one repository.

## E2. Peer messages are non-authoritative by design

From the Claude Code cross-session messaging documentation, on how a session treats an
incoming message:

> When session A messages session B, Claude Code tells B's Claude that the message came
> from another session, not from you, and limits what the message can do:
> **It can't approve anything** — a message from another session never counts as your
> consent, so it can't answer a pending permission prompt on your behalf.
> **It can't change configuration** — Claude Code instructs the receiving Claude never to
> change permission settings, `CLAUDE.md`, or other configuration because another session
> asked.
> **Commands don't run** — a command in the message's text, such as `/compact`, arrives as
> plain text. Claude Code never executes it.
> **Permission prompts still fire.**

And from the agent-teams documentation, on auto mode:

> It treats an approval claim relayed from another agent as untrusted input rather than
> confirmation from you.

The security literature agrees independently. From a 2026 survey of multi-agent patterns
and pitfalls: uncritically accepted outputs from one agent become trusted inputs for
downstream agents, amplifying errors exponentially; the stated mitigation is to treat
inter-agent messages as untrusted data requiring verification, with human approval gates
for critical decisions.

**Therefore:** the refusal described in the topic is the specification, not a defect. No
choice of mail transport removes it. A mail system that *did* grant authority would be a
prompt-injection hole.

## E3. Where authority actually comes from

Three mechanisms carry more than peer weight, in ascending strength:

1. **Spawn-time brief** — becomes the child's own prompt. Full authority, one shot, no
   mid-turn steering.
2. **Hook injection** (`SessionStart` / `UserPromptSubmit` `additionalContext`) —
   harness-authored, so it lands above the peer boundary, and it works mid-session.
3. **Human relay / Remote Control** — the human types it. Unforgeable, unautomatable.

cyberlegion has a fourth, which the others do not: **pane injection**. `unit nudge` and
`unit clear` drive the multiplexer to type into a peer's pane via cyber-mux. Text typed
into a pane arrives as the user's own turn. That is the `order` mode, and it already
works.

## E4. cyberlegion's existing seams

From `packages/cyberlegion/src/store/store.ts`, the header comment on the `Store` seam:

> Domain types + the Store seam ALL mailbox + registry + brief access goes through. Pure —
> no fs/net here; `FileStore` (file-store.ts) is the current on-disk implementation, and a
> later `SqliteStore` is the sanctioned swap when FTS search, relational features, or
> measured volume/concurrency pain motivate it (identity/message/runtime code never
> changes).

From `plugins/cyberlegion/skills/session-adapter-governance/SKILL.md`, the ratified rule
(ADR-0025, drafted off the cr150 nudge boot-race):

> A mutating operation must **verify its observable effect actually took hold** before
> reporting success, and **fail loud** rather than report false success when it cannot.
> Never fire-and-forget.

## E5. A2A's transport requirements

A2A runs over HTTP, JSON-RPC, and Server-Sent Events. An agent must function as an HTTP
server, exposing endpoints such as `/sendMessage` and `/sendMessageStream`, discovered via
an Agent Card and authenticated with JWT via OpenID Connect. The lifecycle is discovery →
authentication → sendMessage → sendMessageStream. It supports long-running operations,
streaming, multi-turn interaction, and push notifications.

The specification documents **no local or non-network transport**.

Agent lifecycle is out of scope for A2A: the protocol addresses agents that already exist.
There is no spawn and no despawn. A 2026 arXiv analysis of governance gaps in MCP, A2A,
and ACP finds that none of the three can express authority or governance constraints.

## E6. agmsg's shape

Agents message each other over a shared local SQLite file. No daemon, no network. Agents
reach the log directly rather than through a central broker. Eight agent types with three
driver models — `native` (Claude Code, OpenCode), `bridge` (Codex), and `rule-file` (the
rest). Some types support `monitor` and `turn` capabilities. A terminal-embedded GUI
spawns agents in real PTYs.

The published material documents **no authority or priority levels, no despawn procedure,
and no spawn-with-brief contract**.

## Sources

- https://code.claude.com/docs/en/cross-session-messaging
- https://code.claude.com/docs/en/agent-teams
- https://a2a-protocol.org/latest/topics/what-is-a2a/
- https://en.wikipedia.org/wiki/Agent2Agent
- https://arxiv.org/pdf/2606.31498 — Governance Gaps in Agent Interoperability Protocols
- https://zylos.ai/research/2026-02-15-agent-to-agent-communication-protocols/
- https://khimananda.com/blog/multi-agent-systems-patterns-and-pitfalls
- https://mcpagentmail.com/
- https://github.com/fujibee/agmsg — and https://agmsg.cc/
- https://github.com/MustaphaSteph/agent-bus
- https://jtianling.com/en/cross-agent-teams-release.html
- https://github.com/openai/codex/issues/12462
- https://www.agentmail.to/
