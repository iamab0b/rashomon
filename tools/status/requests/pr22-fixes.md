# PR #22 (hazel/ui-refine at 19f2bec): review fixes (from Sahil)

PR #22 was reviewed and is not merged. The override's apply-once guard, the caught throws, the read-only statuses and the combination with main (e546092: PR #20 polish and PR #21 props) are all good; typecheck and tests pass on the merge. One blocker and four smaller fixes.

Paste into your Claude Code session on branch `hazel/ui-refine`. Push new commits, with no force-push and no rebase.

1. **Blocker: keep the PR inside your folders.** It changes scene-core's files (apps/web/src/scene/cameras/presets.ts, presets.test.ts, useSceneKeys.ts, index.ts in cf2520b) and the timeline (apps/web/src/scene/timeline/Timeline.tsx, layout.ts, handlers.ts, Timeline.test.tsx in 60532cb). Scene code is Sahil's lane, and the worktree rule says the UI only uses what apps/web/src/scene/index.ts exports.
   - Restore those files to main's version in one new commit: `git checkout origin/main -- apps/web/src/scene && git commit -m "ui: leave scene files to scene-core"`.
   - Write what you need from the scene instead (the POV key move to 2, the timeline state and spacing changes) as a short list in the PR description. Sahil decides and scene-core builds it.
2. **The view switcher goes through useCamera() (ViewSwitcher.tsx line 53).** It writes the store through applyViewKey. Use `setPreset(...)` and `togglePov()` from `useCamera()` in apps/web/src/scene/index.ts.
3. **Keep every camera view reachable.** With the key remap, `witness_claimed` lost its key and has no switcher button, so the claimed-sightline view is unreachable except through ?cam=. Add it to the switcher.
4. **Shortcuts behind the modal (OverrideDialog.tsx lines 78 to 85).** After cancelling the confirmation, pressing 2 toggles POV behind the dialog. Call `e.stopPropagation()` in the form's onKeyDown, as OverrideConfirm.tsx line 65 does.
5. **Tests use scene internals (viewSwitcher.test.tsx, contextDrawer.test.tsx, overrideConfirm.test.tsx).** They import ../scene/store and ../scene/playback/graphSource. Build the snapshot from what scene/index.ts exports, or from @rashomon/schema/fixtures plus resolve and gate.
6. **Your open follow-ups (tools/status/requests/ui-refine-followups.md, items 1 to 5) can all be done now**: main has useGraphErrors, useGraph().graph and useSceneStatus. Item 1 matters for the live demo, because a server rejection after "Override sent" is never shown.

Done-check:
- `git diff --name-only origin/main...HEAD | grep apps/web/src/scene` prints nothing.
- `pnpm -F web typecheck` and `pnpm -F web test` pass.
- `git grep -n "useGraphErrors\|useSceneStatus" apps/web/src/ui` shows them used.
- Greptile is not running; do not wait for it. The leader reviews and merges.
