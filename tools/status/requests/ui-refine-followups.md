# UI refine: review follow-ups for PR #17 (from Sahil)

PR #17 (hazel/ui-refine at 01bf51d) was reviewed: clean, no blocking issues. It waits on one thing from scene-core: PR #18 (merged, f2e2b5d) also mounts the Timeline, inside Scene.tsx, so with both on main the app shows two timelines. Your docked mount in App.tsx is the better placement and stays. Scene-core's follow-up PR (branch scene-core-06b) removes the Scene.tsx mount, and #17 merges right after it. You do not need to change your mount.

Paste into your Claude Code session on branch `hazel/ui-refine`. Push new commits to it, with no force-push and no rebase. Change only apps/web/src/ui/.

After `git fetch origin && git merge origin/main` (main now has 06 drag-to-edit and `useGraphErrors` in apps/web/src/scene/index.ts):

1. Show the errors the scene now exports. `useGraphErrors()` returns the live connection error and the last action error.
   - Badge: show "Live · disconnected" when the connection error is set. Today it stays green "Live" over a stale snapshot.
   - Panel: show the action error as your toast or an inline alert. In live mode an override or a drag goes to the server, and a rejection (for example a stale version) only arrives there. The override dialog now closes before the server answers, so this is the only place the investigator sees a failure.
2. Place labels after a drag. places.ts:34 labels event cards from the static robberyGraph anchors, so after an investigator drags e5 to the window, the card still says "From chips aisle". Scene-core's follow-up adds `graph` (the EventGraph the snapshot was resolved from) to `useGraph()`. When it is on main, label from `useGraph().graph` anchors (landmark ids) and drop the robberyGraph import. Until then, leave places.ts as it is.
3. Spinner wording. shared.tsx:106 and RightPanel.tsx:79 show a spinner and "Checking against the room…" on every live proposed event. If the gate never answers, it spins forever. Use static text, "Awaiting check", with no spinner.
4. Optional: transcript.ts:1 imports packages/extractor fixtures by a relative path. If it is quick, ask Sahil to export the transcript from @rashomon/schema/fixtures; otherwise leave it.

Done-check:
- `pnpm -F web typecheck` and `pnpm -F web test` pass.
- `git grep -n "useGraphErrors" apps/web/src/ui` shows the badge and the panel using it.
- `git grep -n "Checking against the room" apps/web/src/ui` prints nothing.
- Greptile is not running; do not wait for it. The leader reviews and merges.
