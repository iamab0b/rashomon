# PR #35 round 2 (interview-screen at 93c9c0e): fixes before merge (from Sahil)

The round-1 fixes are in, confirmed by an Opus review: the frozen result, the full signature with props and "Updated N details", Escape, the no-duplicate toast, Copy feedback and the slow timer from submit. Greptile (3/5) holds on two findings. Push to `interview-screen`; no force-push.

1. **Resubmitting a finished statement stalls the form** (apps/web/src/ui/statement.ts line 109).
   - submitStatement reuses the finished segment (same id, by design) and the graph does not change, so the "done" guard never clears. The form stays on "Extracting…" with Submit disabled.
   - When useStatementStatus already reports done for that segment id, show the saved result at once ("Already added: N events").
   - Test: submit, wait for done, submit the same text again; the result shows and Submit is enabled.
2. **Code comments break the repository rule** (RightPanel.tsx line 106, StatementSection.tsx lines 68 and 194, statement.ts lines 77 and 102 to 104, statement.test.tsx line 188). Remove them; put explanations in the PR description.
3. **LOW: an early freeze in live mode** (statement.ts lines 108 to 109). Another editor's change can arrive before this statement's row and freeze the result early. In live mode, freeze only when graph.version has passed the baseline's version; keep the "visible change" fallback for fixture mode.
4. **The controller test** still calls the helpers, not the mounted component, because the web package has no DOM test library. Sahil decides whether to add happy-dom as a dev dependency. Until then, leave it and say so in the PR.

Done-check:
- `pnpm -F web typecheck` and `pnpm -F web test` pass.
- `git grep -nE "^\s*//|/\*" -- apps/web/src/ui/StatementSection.tsx apps/web/src/ui/statement.ts apps/web/src/ui/RightPanel.tsx` prints nothing.
- Greptile reviews the push; the leader reviews and merges.

## Round 3 (Sat 5:20 PM): one fix before merge

522507a: an Opus review is clean (no comments left, live freeze on version only, the earlier behaviour holds). Greptile (3/5) still holds the merge on one finding, which the review confirms as MEDIUM. Its second finding (finished results absorb other users' edits) is not valid: a set result is frozen (statement.ts line 150). Push to `interview-screen`; no force-push.

1. **A fresh live result is mistaken for a resubmit** (StatementSection.tsx line 198).
   - `resent` is set from the first status seen. In live mode, if another editor's change bumps the version before this statement's row arrives, the status reads done, the fresh statement is marked resent, and it shows "Already added: no events found" for good.
   - Count a submission as resent only when a result was already saved for that segment id in this tab, or the segment row already existed before this submit (useStatementStatus had a patchCount for it before you called submitStatement). Otherwise go through resultOf as usual.
   - Test: a fresh submit whose status is done on its first reading, with no saved result, shows its own result, not "Already added".
2. **LOW:** with patchCount 0, show an empty outcome, never "Added N events" from another editor's change (statement.ts lines 121 to 136).

Greptile reviews the push; the leader reviews and merges.

## Round 4 (Sat 6:10 PM): two small fixes, then merge

6dce3f9: a fresh Opus review is clean. Both round 3 items are in, the revert checks fail their tests, earlier rounds hold, and the branch merges cleanly. Greptile (3/5) still holds the merge on two findings. The review rates one of them LOW and the other is new; both are small. Push to `interview-screen`; no force-push.

1. **A fresh live result can still read as a resubmit** (StatementSection.tsx lines 195-201, statement.ts line 109). "First reading is done with a patchCount" stands in for "the row existed before submit". When extraction finishes before the first render that sees the segment, the statement shows "Already added". Fix: compute the segment id when Submit is pressed, read the store's status for that id at that moment, and keep it. A submission is resent only if that saved status already had a patchCount, or if this tab saved a result for the id. Test: a fresh submit that is done on its first reading, and had no status before submit, shows its own result.
2. **Old results survive a scene change** (statement.ts lines 108-109). The saved results are keyed by segmentId only. After a dropped scan replaces the graph in the same tab, submitting the same witness and text shows the previous graph's result. Fix: key the saved results by graph source (scene id plus mode) and segmentId, or clear them when the graph source changes. Test it.
3. **LOW, optional:** one mounted test of StatementSection's wiring, if happy-dom is already set up for the web tests. Skip it otherwise.

Greptile re-reviews the push; the leader reviews and merges.
