# extractSegment procedure in the SpacetimeDB module (from Sahil)

Seat A is gone, so the module splits: I publish the tables, reducers (`insertSegment`, `applyPatches`, `override`, `setStatuses`) and the `graphForScene` view by about Sat 9:30 AM (H+12.5). You own `spacetimedb/server/src/procedures/extractSegment.ts` and the Cartesia webhook handler.

## Shape

`extractSegment(sessionId, segmentId)`:
1. Read the segment's utterances and the current graph.
2. Call your extractor (Claude Sonnet 5.5, strict Patch tool) to get `Patch[]`.
3. Run `resolve()` and `gate()` from `@rashomon/engine` on the graph with the patch applied.
4. In one transaction: apply the patch, write the gate's statuses and flags, record provenance (segment id, utterance ids, model, prompt hash).

## SpacetimeDB facts (checked against spacetimedb 2.13.0 and the local CLI)

1. **No relay.** An HTTP handler receives a `HandlerContext` with `http`, `env` and `withTx`. It can call your procedure directly by passing its ctx, `extractSegment(ctx, ...)`, so the Cartesia webhook lands in the module itself. Do not build a Node relay.
2. **Fallback if the direct call misbehaves.** The handler inserts a row into a schedule table with `scheduledAt` = now and returns 200. The scheduled procedure then runs after the handler returns. Return the flags on the agent's next turn instead of in the webhook response.
3. **Engine inside the module.** `spacetime publish` bundles local workspace packages; a local `spacetime build` with `@rashomon/engine` imported succeeded and the bundle contains the gate. Add `"@rashomon/engine": "workspace:*"` to `spacetimedb/server/package.json`. extractSegment imports `resolve()` and `gate()` from `@rashomon/engine` and runs them inside the same `ctx.withTx` that applies the patch. Call `applyPatches`'s logic and `setStatuses`'s logic there too, so patch, statuses and flags commit together.
   - Call Claude with `ctx.http.fetch` **outside** the transaction, then open `ctx.withTx` for everything that writes.
   - The Anthropic key is a module environment variable declared in the module's schema `env` (for example `ANTHROPIC_API_KEY`) and read as `ctx.env`. It is supplied at publish from the shell (`ANTHROPIC_API_KEY=... spacetime publish ...`; declared shell variables override config). Never put it in `spacetime.json`, `.env` committed to git, or any file in the repo.

Until the module exists, build it as a plain async function in `packages/extractor/src/procedure.ts` that takes the graph and segment as arguments and returns `{patch, statuses, flags}`; wrapping it in the Spacetime procedure is then ten lines. Test it against `robberyGraph` plus your example 01.

Install the two Spacetime skills in your Claude Code first (commands in the design doc's "Start here"). API keys live in the Spacetime module's environment or `.env`, never in the repo.

`/team-status` closes this item when a file under `spacetimedb/` contains `extractSegment`.
