# Topic — agent communication mechanisms

## Question

cyberlegion implements one mechanism for agent-to-agent communication. AgentMail is
another. What else exists, which is the best substrate for **per-turn** communication,
and how does an agent receive **authoritative direction** rather than peer chatter?

The motivating observation: an agent treats a mail-delivered command as peer
communication and refuses to act on it until the same instruction arrives directly from
the user's prompt. That refusal looked at first like a defect in the mail layer. The
research question is whether a different mechanism would remove it.

## Scope

Two decisions are in scope:

1. **Landscape** — what mechanisms exist for agent-to-agent communication, across
   harness-native features, local message buses, filesystem transports, and wire
   protocols.
2. **Substrate choice** — should cyberlegion replace its own transport with
   [agmsg](https://github.com/fujibee/agmsg) or with
   [A2A](https://a2a-protocol.org/), given that cyber-mux must stay for
   cross-multiplexer support.

The required communication modes are fixed by the product, not by the research:

| Mode | Meaning |
| --- | --- |
| `spawn` | Create a peer session, carrying a brief |
| `despawn` | Tear a peer session down |
| `peer-message` | Non-authoritative message between peers |
| `order` | Authoritative direction — remote control |
| conversation | Per-turn chat, question-and-answer, multi-round |

## Out of scope

- Agent-to-human and agent-to-service email (AgentMail's actual category).
- Cross-organization agent federation.
- Any change to cyber-mux itself.

## Date

Researched 2026-08-19 / 2026-08-20.
