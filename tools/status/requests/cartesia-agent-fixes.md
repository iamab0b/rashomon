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

## Sat 4:25 PM: review of f8239cc (Opus and Sonnet clean; Greptile 4/5 holds)

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

## Sat 5:05 PM: #34 merged; the follow-up PR carries the rest

PR #34 merged as 2a5f972 at f8239cc over Greptile's 4/5, on Sahil's decision. The import-list conflict in procedure.test.ts with #33 was resolved as the union by the leader. Your follow-up PR, on a new branch from main, carries:
1. Greptile's finding: store the chosen askNext with the segment, so a retried record_statement gets the same question;
2. scene_context peeks only, and the smoke script uses a scratch session;
3. the repeated "Yes." fix: dedupe only on a client segmentId, or the same witness's identical text under 15 s old, with the faked-clock test;
4. guarded withTx in scene_context and end_interview;
5. regenerated bindings: the committed types.ts lacks the type-only AskedFlags. Run `spacetime generate --lang typescript --out-dir apps/web/src/scene/live/bindings --module-path spacetimedb/server -y`;
6. the resend test's exact name.

Greptile plus Opus and Sonnet review it.

## Sat 5:35 PM: PR #41 round 2 (Greptile 3/5 holds; Opus and Sonnet both CLEAN)

All six items are in and verified, and the bindings equal a fresh generate. webhook_statements is private and additive, so the publish is -c=never with no --break-clients. Greptile holds on two findings; both reviews confirm both. Push to cartesia-followups, no force-push.

1. **MEDIUM (Greptile, both reviews, confirmed by a probe): the agent asks the same question twice** (apps/agent/src/instructions.ts lines 4-5 and 16, config.ts line 69). scene_context now only peeks, but the instructions still say "Use get_scene_context to get the next follow-up question", and config.ts says "Call it when you need the next question". The agent asks nextQuestion, the answer leaves the flag open, and record_statement hands back the same flag as askNext. Fix: follow-up questions come only from record_statement's askNext. Describe nextQuestion as context only (or drop it from the tool's response). Add an INSTRUCTIONS test named "follow-up questions come only from askNext" (the tracker greps for it).
2. **MEDIUM (Opus): the 15 s window starts before a long extraction** (cartesia.ts line 104). If a 20 s extraction's response is lost, Cartesia's retry counts as a new statement and the events are extracted twice. Fix: measure the window from the segment's extractedAt, falling back to storedAt, with a faked-clock test.
3. **LOW (Greptile, both reviews): a retry of a segment with no webhook_statements row gets a new question each time** (cartesia.ts lines 172 and 251). This covers segments stored before this publish or by another path. Fix: in the early return, insert the missing webhook_statements row with the flag chosen, so later retries return it.
4. Say in the PR description that it also carries the 413 for over-cap text (cartesia.ts:164) and the snapshot cap (run.ts:129).
5. **Put askNext first in the record_statement response** (Sahil, Sat 7:40 PM). Cartesia cuts tool responses over 16 KiB, so a long response can lose the question. Make askNext the first key of the JSON body, before the events and flags, and keep the whole response under 16 KiB: trim the event and flag lists from the end when needed and add `truncated: true`. Test: a response with many events is under 16 KiB and still starts with askNext.

The leader re-runs Greptile, Opus and Sonnet on the push.
