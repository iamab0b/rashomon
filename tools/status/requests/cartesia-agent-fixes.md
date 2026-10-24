# PR #34 (cartesia-agent): what is left before merge (from Sahil)

PR #34 is the Cartesia track, second only to the extraction fix. Two fresh reviews (Opus and Sonnet) of 28308e5 and Greptile verified most of it:
- every route checks the secret first, constant-time and fail-closed, with the 413 before parse;
- the plain-text route shares the insert and extraction path;
- scene context leaks nothing;
- setup.ts reads keys from env only, redacts errors and pins cartesia-version 2026-08-14;
- no real key anywhere;
- the merge with main kept submit_statement, editors-only insert_segment and the queue;
- the request shapes match Cartesia's docs.

Your 75e053e addresses Greptile's timeout and overridden-flag findings and the #27 witness-id collision; the leader re-reviews it next. #27 merges as part of #34, so you do not need to touch the spacetime-procedure branch. Push new commits to cartesia-agent; no force-push, no rebase, and do not merge it yourself.

1. **HIGH: the agent's system instructions have no ask-back rule and no cognitive-interview rules** (apps/agent/src/instructions.ts lines 1 to 6). The only hint is the tool description ("ask the first flag's suggestedQuestion"). The agent therefore re-asks the same e5 question after every turn once a flag comes back or is overridden. It also sees each flag's `detail` and `check`, with nothing stopping it from telling the witness their account is implausible. Put both into INSTRUCTIONS:
   - after record_statement returns, ask the suggestedQuestion of one new hard flag it has not asked before, on its next turn, in its own words but keeping the content;
   - never say "implausible", "impossible", "lie", "wrong" or anything that judges the witness, and never read out `detail` or `check`;
   - record the witness's answer with record_statement as a new statement;
   - the interview order: free narrative first without interrupting, then anchor each event to landmarks ("closer to the window or the fridge?"), then times ("before or after he came through the door?"), then sightlines.
   - Test in agent.test.ts: INSTRUCTIONS contains each rule. Add a server test with the faked e5 webhook response (procedure.test.ts, the robbery path) showing the response carries one unasked, non-overridden hard flag with its suggestedQuestion.
2. **MEDIUM: back-to-back identical statements are dropped** (http/cartesia.ts lines 63 to 78, resolveSegmentId). A witness who answers "Yes." twice in a row, which is common in the ask-back flow, has the second answer treated as a retry and gets the previous result.
   - For the plain-text route, which has no times, dedupe only when the client sends the same segmentId, or when the same witness's previous segment has identical text and was stored less than 15 seconds ago (a Cartesia retry), not otherwise.
   - Test: two identical "Yes." statements 20 s apart (faked clock) both extract.
3. **LOW: unguarded transactions** (cartesia.ts lines 185 and 221). withTx in scene_context and end_interview has no try/catch, so a host error becomes a 500 that may carry the raw message. Catch it and return the generic error, as the statement route does.
4. **Still open from procedure-followups (do them on this branch):**
   - cap earlier segments in snapshot before Claude (run.ts line 119);
   - a 413 before storing over-cap text;
   - rename the resend test to exactly "a resend without a segmentId does not extract twice".

Done-check:
- `pnpm -r typecheck && pnpm -r test` pass.
- `git grep -n "the agent asks each new hard flag once" apps/agent spacetimedb/server/src` shows the new test.
- No real keys; no code comments.
- Greptile reviews every push. Read its comments and fix what it confirms; the leader triggers it.

## Sat 3:40 PM: merge #27 into this branch after it merges

You pushed the witness-id fix to spacetime-procedure (b4b9c76) as well as here (75e053e). The two now conflict in http/cartesia.ts and procedure.test.ts. The leader merges #27 first, once its reviews and Greptile are clean. Then run `git fetch origin && git merge origin/main` on cartesia-agent, keep one witness-aware hash (b4b9c76's), and push it together with the fixes above. No rebase, no force-push.

## Sat 6:30 PM: review of f8239cc (Opus and Sonnet clean; Greptile 4/5 holds)

The ask-back rule and interview order are in INSTRUCTIONS with tests. asked_flags is private and additive (-c=never is enough). Overridden flags are filtered, and the timeout is 120 s. Nothing of main was reverted. Greptile holds the merge on one finding, and the reviews add one MEDIUM. Push to cartesia-agent; no force-push.

1. **Greptile: a retried record_statement loses its question** (http/cartesia.ts line 194, takeNextQuestion).
   - The flag is marked asked when it is chosen, before the agent receives the response. If that response is lost and Cartesia retries the same segment, the retry gets a different askNext, or null, and the original question is never asked.
   - Store the chosen askNext with the segment (a column or the asked_flags row keyed to the segment). A retry of the same segment returns the same askNext. Test it.
2. **Greptile: the smoke script consumes follow-ups** (tools/smoke/cartesia-webhook.sh line 37). Its scene_context call marks a question as asked. Make scene_context only peek, never mark (this also fixes the reviews' LOW that get_scene_context right after record_statement silently consumes a second flag), and point the script at a scratch session.
3. **MEDIUM (both reviews, confirmed by a probe): a repeated "Yes." is dropped** (cartesia.ts lines 84 to 91). Dedupe only on a client-sent segmentId, or the same witness's identical text stored less than 15 s ago (segments needs a stored-at time). Add the faked-clock test: two identical statements 20 s apart both extract.
4. **LOW:**
   - guard withTx in handleSceneContext and handleEndInterview with the generic error;
   - regenerate the bindings (the committed types.ts lacks AskedFlags);
   - the resend test's exact name.

The leader re-runs Greptile, Opus and Sonnet on the push.
