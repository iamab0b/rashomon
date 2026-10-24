# extractSegment procedure in the SpacetimeDB module (from Sahil)

Seat A is gone, so the module splits: I publish the tables, reducers (`insertSegment`, `applyPatches`, `override`, `setStatuses`) and the `graphForScene` view by about Sat 9:30 AM (H+12.5). You own `spacetimedb/server/src/procedures/extractSegment.ts` and the Cartesia webhook handler.

## Shape

`extractSegment(sessionId, segmentId)`:
1. Read the segment's utterances and the current graph.
2. Call your extractor (Claude Sonnet 5.5, strict Patch tool) to get `Patch[]`.
3. Run `resolve()` and `gate()` from `@rashomon/engine` on the graph with the patch applied.
4. In one transaction: apply the patch, write the gate's statuses and flags, record provenance (segment id, utterance ids, model, prompt hash).

Until the module exists, build it as a plain async function in `packages/extractor/src/procedure.ts` that takes the graph and segment as arguments and returns `{patch, statuses, flags}`; wrapping it in the Spacetime procedure is then ten lines. Test it against `robberyGraph` plus your example 01.

Install the two Spacetime skills in your Claude Code first (commands in the design doc's "Start here"). API keys live in the Spacetime module's environment or `.env`, never in the repo.

`/team-status` closes this item when a file under `spacetimedb/` contains `extractSegment`.
