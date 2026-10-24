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

## Review of PR #16 (spacetime-procedure at 4b5ef76): fix before merge and before any publish

Sahil built the procedure and the webhook and handed them to you. PR #16 now targets main. The leader's review approved its foundations:
- The key is read from `ctx.env` and sent only in `x-api-key`.
- The Claude call sits outside the transaction, with patch, regate and provenance in one `withTx`.
- The patch goes through `applyPatchBatch`, the same body as the reducer.
- Prop ids are minted as `p_<type>`.
- The hash is deterministic.
- The new dependencies are workspace links.
- The bindings match a fresh generate.

It is not merged. Push fixes to branch `spacetime-procedure` (no force-push, no rebase). Each fix needs a test that fails without it.

1. **Shared-secret check on the webhook (http/cartesia.ts lines 76 to 90).** Today anyone who finds the URL can POST `{sessionId, utterances}` for any existing session, spend Claude credits with the module's key, and write patches.
   - Declare a second module env var, `CARTESIA_WEBHOOK_SECRET`, in the schema env, set at publish like the Anthropic key.
   - Reject any request whose secret header (for example `x-rashomon-webhook-secret`) does not match, using a constant-time comparison. Return 401, and do not call Claude.
   - Configure the same secret in the Cartesia dashboard. Never put it in the repo.
2. **Bound the request.** Cap the body size and the utterance count, for example at 64 KB and 50 utterances, with a 413 or 400 response. `Math.min(...)` over an unbounded `utterances` array (line 63) can throw a RangeError.
3. **Return the hard flags to the agent (cartesia.ts line 73).** The response carries statuses only. Return the session's hard flags after the gate as `{ id, eventId, check, detail, suggestedQuestion }`, so the Cartesia agent can ask the suggested question on its next turn.
4. **Idempotency (procedures/extractSegment.ts, extract/run.ts line 170).** Calling extractSegment again for an already-extracted segment re-spends credits and re-applies patches. `extractedAt` is written but never read. If a segment has `extractedAt` set, return the stored result without calling Claude.
5. **Generic errors to callers (cartesia.ts line 71, run.ts line 205).** Upstream Anthropic messages and "applying the patches failed: ..." go back to an anonymous caller, and the key is scrubbed only by exact match. Return a generic error ("extraction failed") with a status code, and keep the detail only in the segment's `extractError`.
6. **A real rollback test (procedure.test.ts line 185).** The current test uses one dangling-target patch that fails before any write. Use a two-patch batch whose second patch fails, and assert the first patch, the version and the statuses are all unchanged.
7. **The demo path test.** No test covers the robbery. Feed the robbery's first-witness segment through runExtraction with a faked Claude response: the recorded tool output that produces the robbery patches. Assert e5 comes back implausible with `sightline:e5` and its suggestedQuestion is in the webhook response.
8. **Decision to note in the PR.** run.ts line 190 applies at the session's current version, so the stale-version check can never fail on this path. That is acceptable, because the procedure owns the read and the write. Say so in the PR description so nobody relies on the check there.

`/team-status` closes this item when a file under `spacetimedb/server/src/` contains `CARTESIA_WEBHOOK_SECRET`, the shared-secret check from fix 1.
