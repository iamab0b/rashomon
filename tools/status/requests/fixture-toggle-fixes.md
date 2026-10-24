# Fixture toggle: review fixes for PR #14 (from Sahil)

PR #14 is blocked: it shows invented statuses (`?preview=statuses`), and the toggle never reaches the scene. The demo has to run on fixtures with every status coming from the gate, and the badge has to tell judges truthfully which mode they are watching.

Paste into your Claude Code session on branch `hazel/fixture-toggle`. Push new commits, with no force-push and no rebase. Change only apps/web/src/ui/ and the one App.tsx line you already touch.

PR #14 was reviewed and is blocked for now. It is built on PR #12's commits, so #12 merges first. Do tools/status/requests/override-dialog-fixes.md on `scene-ui`, then run `git merge origin/scene-ui` here. Three changes on top:

1. Remove the status preview.
   - `?preview=statuses` (statusPreview.ts lines 21 to 31, used at RightPanel.tsx lines 46 to 50) reassigns real events to statuses they do not have, so every status shows on screen. The team rule is that every status comes out of resolve() and gate(), and the UI never invents one, even for display.
   - Delete statusPreview.ts and the `?preview` handling.
   - To show every status style, render the cards from a small test fixture in a Vitest or a static story file under apps/web/src/ui/__fixtures__/, never in the running app.
2. The "accepted events stay rejected" finding (Greptile, RightPanel.tsx line 112) is the same as fix 1 in the override-dialog request: the panel shows the gate's status plus an "override pending" note. If you have done that on scene-ui, it arrives with the merge.
3. Make the toggle switch the source for real.
   - `useGraphMode` in TopBar.tsx only calls `history.replaceState` and sets local state, so the scene never sees the change.
   - The scene reads the mode from the URL when it mounts. Set `?mode=fixture` or `?mode=live` with `location.search` (a reload), and keep the badge.
   - Note: main's Scene.tsx does not read `?mode` yet. scene-core adds the live GraphSource and the `?mode=live` switch next (night item N3). Until that lands, live shows your red "not connected" badge over the fixture, and that is fine for the demo.
   - Do not import anything from apps/web/src/scene except through its index.ts.

Done-check:
- `pnpm -F web typecheck` and `pnpm -F web test` pass.
- `git grep -n "previewStatuses\|preview=statuses" apps/web/src` prints nothing.
- Switching the toggle reloads with the new `?mode`, and fixture is the default with no query string.
- Update the PR description: it depends on #12, and live is wired once scene-core's N3 lands.

`/team-status` closes this item when no file under `apps/web/src/ui/` contains `previewStatuses` and the toggle reloads with `?mode=`; the tracker's grep watches for `location.search` in apps/web/src/ui.
