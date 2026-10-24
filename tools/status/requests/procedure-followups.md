# extract_segment follow-ups after PR #16 merged (from Sahil)

PR #16 merged to main as ba4f821 at 103524e. Two fresh reviews (Opus and Sonnet) found it clean: the caller check works (a client cannot present the module identity, and the webhook calls runExtraction directly), the 32,000-character cap is in snapshot, short error codes are stored, and none of the first eight items regressed. Thank you.

Four items from the third review were not done, and the reviews found one new gap. Start a new branch `procedure-followups` from origin/main, open a PR to main, and do not merge it yourself. Each fix needs a test that fails without it. No force-push.

1. **MEDIUM: earlier segments reach Claude uncapped (extract/run.ts line 123, packages/extractor/src/prompt.ts lines 77 to 80).** The cap checks only the segment being extracted. The prompt also carries the last five earlier witness segments at full length, and insert_segment is open to any client for the demo. A probe test pushed a 320,000-character earlier segment into the request body. In snapshot, drop or truncate every earlier segment over MAX_SEGMENT_TEXT_CHARS before Claude is called. Sahil is separately adding a text cap to insert_segment itself.
2. **MEDIUM: retry-safe default segment id (http/cartesia.ts line 69).** With no segmentId the id is `seg_<now>`, so a Cartesia retry after a slow Claude call extracts again and duplicates events. Use `seg_` plus fnv1a64 over sessionId and each utterance's text and times, and add a test named "a resend without a segmentId does not extract twice".
3. **LOW: over-cap text answers 413 before anything is stored (cartesia.ts line 9 vs run.ts line 30).** A 64 KB body can carry more than 32,000 characters of text, which today becomes a stored segment and a 502 segment_too_long.
4. **LOW: wrap the key read (run.ts line 231).** A throwing `io.apiKey()` returns the host's raw error. Treat a throw as `no_api_key` and return the generic 502.
5. **LOW: code comments (cartesia.ts lines 34 and 85, run.ts lines 25, 67, 79 to 80 and 249).** .greptile/rules.md says no code comments; move the explanations into the PR description.
6. **PR text.** Say that publishing needs -c=always, because the segments columns have no defaults, and that `spacetime publish` refuses to run without ANTHROPIC_API_KEY set (seen locally). Fix the stale line that says a 500 stores "Anthropic API 500: overloaded"; it now stores `model_error`.

`/team-status` closes this item when a file under `spacetimedb/server/src/` contains the test name `a resend without a segmentId does not extract twice`.
