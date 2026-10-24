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


## Third review (PR #16 at 966627c, Sat 10:55 AM)

Two fresh reviews (Opus and Sonnet) verified all eight items above, each with a test that fails when the fix is reverted. Typecheck, 94 module tests, `spacetime build` and a fresh `spacetime generate` all pass on the trial merge with main. It is not merged, because both reviews found the same blocker. Push to `spacetime-procedure`, no force-push and no rebase.

1. **Blocker: the procedure is a second, unauthenticated way to spend the key (procedures/extractSegment.ts lines 5 to 14).**
   - `extract_segment` is a public procedure in the generated bindings, with no `ctx.sender` check, and `create_session` and `insert_segment` are open to any client.
   - On Maincloud, anyone can create a session (and so be its creator), insert a segment of any size, and call `extract_segment`. That spends Claude credits with no webhook secret and no 64 KB cap, again and again under new segment ids.
   - The webhook calls `runExtraction` directly and nothing else calls the procedure, so close it to outside callers. Either reject every `ctx.sender` other than `ctx.databaseIdentity` before any read or Claude call, or stop exporting it from index.ts and regenerate the bindings.
   - Also cap the segment text length in `snapshot` (run.ts line 88) before Claude is called, so a large row inserted through `insert_segment` cannot reach the model.
   - Add a test named "an anonymous caller cannot run extraction" that fails without the fix.
2. **MEDIUM: a retry duplicates events (cartesia.ts line 69).** With no `segmentId`, the id is `seg_<now>`, so a Cartesia retry after a slow Claude call makes a new segment, a second Claude call and duplicate events. Derive the default id from `fnv1a64` over sessionId plus the utterance texts and times, and test a resend without a segmentId.
3. **MEDIUM: error detail in a public table (run.ts lines 128 and 167, tables.ts line 99).** `segments` is public, so `extractError` shows Anthropic's upstream messages to every subscriber. Store a short code there (for example `model_error`, `apply_failed`, `bad_tool_output`) and send the detail to the module log.
4. **LOW: the key read is unguarded (run.ts line 211).** `io.apiKey()` is not wrapped the way `readSecret` is, so a throwing env read returns the host's raw error. Wrap it and return the generic 502.
5. **LOW: code comments (cartesia.ts lines 34 and 85, run.ts lines 25, 55, 67 and 228).** .greptile/rules.md says no code comments. Move them into the PR description.
6. **Note:** the six new `segments` columns have no defaults, so publishing over an existing database needs `-c=always`. That is fine locally, and nothing is on Maincloud yet. Say so in the PR description.

`/team-status` closes this item when a file under `spacetimedb/server/src/` contains the test name `an anonymous caller cannot run extraction`.
