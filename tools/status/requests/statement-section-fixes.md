# PR #35 (interview-screen, Statement section): fixes before merge (from Sahil)

PR #35 meets the spec, and an Opus review found it clean. Greptile scored it 4/5 and holds the merge. Its three findings are all real (confirmed by the review), plus one more from the review. Push new commits to `interview-screen`; no force-push, no rebase, and do not merge it yourself. Change only apps/web/src/ui/.

1. **A finished statement keeps changing** (StatementSection.tsx line 198).
   - `outcomeSince(run.baseline, graph)` runs against the latest graph on every render. An override made later, or another editor's statement in live mode, joins its "changed" list and raises "Added N".
   - Freeze the outcome into `run` the first time the status is done and `graph.version` is past the baseline's version. Store the version with the baseline, so live mode does not freeze before the row arrives.
2. **The change signature misses fields** (statement.ts line 19).
   - It leaves out `facing`, `sources`, `supersededBy` and `override`, and counts no prop patches. A statement whose patches only change facing or sources, or only touch props, shows "Added 0 events".
   - Add those fields.
   - When patchCount is above 0 but no event changed, say "Updated N details" rather than "Added 0 events".
3. **Escape cannot close the drawer while typing** (StatementSection.tsx lines 71 and 93).
   - Both fields stop every key, so the drawer's Escape listener (RightPanel.tsx line 96) never fires.
   - Use `if (e.key !== "Escape") e.stopPropagation()`, so scene shortcuts stay blocked and Escape still closes the drawer.
4. **The tests skip the stateful component.**
   - statement.test.tsx drives StatementSectionView with views built by hand, so the done and reject logic (lines 193 to 230) is untested.
   - Add one test that mounts StatementSection on the fixture source and submits the robbery correction: it shows extracting, then the result. A later override must not change that result.
5. **Small, if time:**
   - Suppress RightPanel's "Couldn't apply the change" toast for every statement rejection, not only not-an-editor, since the box already shows it inline.
   - Copy shows "Copied", or "Select and copy" when the clipboard API is missing (plain http on a LAN IP).
   - The 30-second slow timer counts from submit (depend on extracting and run.sent).

Done-check:
- `pnpm -F web typecheck` and `pnpm -F web test` pass, with tests for items 1 to 4.
- `git grep -n "key !== \"Escape\"" apps/web/src/ui` shows item 3.
- Greptile reviews the push. Read its comments and fix what it confirms. The leader reviews and merges.
