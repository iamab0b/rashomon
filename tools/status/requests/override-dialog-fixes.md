# Override dialog and right panel: review fixes for PR #12 (from Sahil)

PR #12 is close: the 10-character rule, the imports and the Greptile fixes are right. Three things block the merge: the panel decides a status itself, which breaks the rule that every status comes out of resolve() and gate(); the dialog is not keyboard-safe; and it does not show the suggested questions the interviewer reads aloud.

Paste into your Claude Code session on branch `scene-ui`. Push one new commit, with no force-push and no rebase. Change only apps/web/src/ui/.

PR #12 was reviewed: approve with fixes. The 10-character rule, the imports, the App.tsx change and both Greptile fixes are all right. Three things before it merges:

1. The UI must never decide a status (team rule: statuses come only out of resolve() and gate()).
   - RightPanel.tsx lines 52 to 53: `statusOf` returns "overridden" when a local override exists, and onConfirm (lines 100 to 105) keeps the override only in `useState`.
   - Change this so the panel always shows the event's status from `useGraph()`. While an override is confirmed but not yet applied, show it as "override pending: <reason>" next to the gate's status, never as the status.
   - Keep emitting the `Override` through the `onConfirm` callback prop for now.
   - Dependency: the real override path is `useGraphActions().applyPatches([{ op: "override", id, reason, by }])`, exported from apps/web/src/scene/index.ts. scene-core is building that hook now (night item N6), and it needs PR #11 (engine-override) on main before the gate returns `overridden`. Both have landed on main (scene-core N6 and PR #11, main 2887c27): `useGraphActions().applyPatches([{ op: "override", id, reason, by }])` now makes e5 come back overridden from the gate. Swap the callback for that call.
   - `applyPatches` throws in live mode (live statuses come only from the server) and when no graph source is mounted. Your modal must catch the error, keep the dialog open, and show the message; never fall back to marking the event overridden in the UI.
   - It also throws on a reason under 10 characters or an override of an event the gate does not mark implausible; your own 10-character check runs first, but catch these too.
2. OverrideDialog.tsx lines 21 to 22 and 64, accessibility:
   - Close on Escape.
   - Trap Tab and Shift+Tab inside the dialog.
   - Add `role="dialog"`, `aria-modal="true"` and `aria-labelledby` pointing at the dialog title.
   - Return focus to the element that opened it when it closes.
   - Keep the labelled reason field and autoFocus.
3. The spec says the dialog shows the event's flags with their `suggestedQuestion`. It currently shows each flag's check and detail only. Add each flag's suggestedQuestion under its detail.

Done-check:
- `pnpm -F web typecheck` and `pnpm -F web test` pass.
- `grep -rn '"overridden"' apps/web/src/ui` shows no place that assigns it; reading or comparing it is fine.
- A Vitest for the pending-override display: e5 still shows implausible, with the pending note.


## Second review (PR #12 at 8aa5596)

Status, the applyPatches path, error handling, the dialog's accessibility and suggestedQuestion are all right now. Two fixes remain:

1. FlagsTab.tsx line 38 offers Override on every flagged event. The gate marks an event implausible only when it has a hard flag. Soft flags (unanchored, missing_time, contradiction) leave it plausible or proposed, and applyPatches then rejects the override however good the reason is. Offer Override only when the event's gate status is `implausible`; show the soft flags with their suggestedQuestion and Jump, but no Override.
2. rashomon-ui.css lines 66 to 67: the modal backdrop is a fixed grid with no overflow, and `.modal` has no max-height. On a short window, tall content is clipped and Accept can fall off screen. Give `.modal` `max-height: calc(100vh - 32px); overflow-y: auto`.

`/team-status` closes this item when a file under `apps/web/src/ui/` contains `aria-modal`.
