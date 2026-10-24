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
