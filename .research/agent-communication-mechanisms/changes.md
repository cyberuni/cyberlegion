# Changes — agent communication mechanisms

Work this research authorizes. Nothing here is done yet.

## Accepted

| # | Change | Source | Status |
| --- | --- | --- | --- |
| 1 | Name the mail plane and the mux plane explicitly in `relay-governance`, with the rule that mail is never authoritative and pane injection is a user turn | [conclusion.md](./conclusion.md) C6.2 | open |
| 2 | Add an **inbound** authority classification to `relay-governance` — it currently keys only on the agent's own outbound lifecycle | C6.4 | open |
| 3 | Record the authoritative-not-authenticated risk wherever the mux plane is documented as carrying orders | C7 | open |
| 4 | Promote cyber-mux's role in doctrine from "spawner" to "authority plane" | C6.1 | open |

## Declined

| Change | Reason |
| --- | --- |
| Replace the transport with agmsg | Single-plane; discards the mux authority plane and `session-adapter-governance`. [conclusion.md](./conclusion.md) C4 |
| Adopt A2A as the substrate | Requires every agent to be an HTTP server; cannot express spawn, despawn, or order. C5 |
| Make peer mail authoritative | Prompt-injection hole; contradicts the documented trust boundary in every harness that has one. C2 |

## Deferred

| Change | Trigger to revisit |
| --- | --- |
| `SqliteStore` behind the existing `Store` seam | Measured volume or concurrency pain, or a need for FTS search |
| Real wake channel to replace the 1s `wake/await.ts` poll | Measured latency complaints in per-turn conversation |
| A2A outbound edge adapter | A concrete need to call a remote A2A agent |
