# UI follow-ups from the #22, #23 and #24 reviews (from Sahil)

PRs #22, #23 and #24 are merged, all with clean reviews. These are the leftover findings. Start a new branch `ui-polish` from origin/main, open a PR to main, and do not merge it yourself. No force-push. The timeline fix (item 1) is in apps/web/src/scene/timeline/; Sahil approved you changing those files for this fix, as with #23.

1. **The playhead's grab area covers block edges (Timeline.tsx line 224).** The transparent grab rect is 14 units wide, runs the full height and is painted over the blocks. Right after "Next flag" sets t to 10, clicking or double-clicking the left edge of e5 starts a scrub instead of selecting it, and a block shorter than about 0.4 s under the playhead cannot be clicked at all. Keep the wide hit area only on the handle strip above the rows (y < TOP), and keep the full-height part at the 2 px line. Add a test that a click at e5's left edge with t = 10 selects e5.
2. **An override the gate did not apply is shown as applied (HistoryTab.tsx line 113, OverrideHistory.tsx line 71).** An event can carry an `override` that the gate did not apply: a live row with a short reason, or an override on an event with no hard flag. It still renders a full "Override · Reason recorded" step while its status is implausible. Render the override and current-state steps only when the gate's status is "overridden"; otherwise show "Override recorded, not applied by the gate".
3. **"Override pending" stays after a live rejection (RightPanel.tsx line 207, overridePending.ts line 18).** If the server rejects a live override, the card keeps "Override pending: …" while the error toast fades after 2.2 s. Clear the pending entry when `useGraphErrors().actionError` arrives. Also re-show the toast for a second rejection with the same message.
4. **Small ones, if there is time:** ArrowUp/ArrowDown and PageUp/PageDown on the playhead slider (handlers.ts line 56); memoise the timeline's rows and lanes on [resolved, statuses] (Timeline.tsx lines 64 to 66); show the date as well as the time in the override lineage (OverrideHistory.tsx line 79); remove the unused OverrideLog and its CSS (shared.tsx line 260).

Done-check:
- `pnpm -F web typecheck` and `pnpm -F web test` pass, with tests for items 1 to 3.
- `git grep -n "not applied by the gate" apps/web/src/ui` shows item 2.
- Greptile is not running; do not wait for it. The leader reviews and merges.
