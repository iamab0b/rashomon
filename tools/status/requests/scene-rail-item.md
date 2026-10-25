# Request: one rail item "Scene" for the scan tools (A1 scan panel, A2 labeling panel)

From Sahil, Sat 6:25 PM. The UI structure is frozen as your list has it, plus this one rail item. Nothing else is added to the rail or the right panel before the freeze (2:00 AM Sunday).

## What to build (apps/web/src/ui, branch scene-rail from main, PR to main)

1. In ContextDrawer.tsx, add a third view `"scene"` to `ContextView`, labelled "Scene", with an icon from Icon.tsx that matches the other two (add one there if none fits).
2. The view renders `SceneTools` from the scene's index (`import { SceneTools, useSceneToolsAvailable } from "../scene"`). It takes no props. It shows the loaded scan's panel (alignment, re-align, file name) and, under `?edit=landmarks`, the landmark labeling panel.
3. Show the "Scene" rail button only while `useSceneToolsAvailable()` is true, that is when a scan is loaded or the labeling editor is open. On the default URL the rail is exactly as it is now: Transcript and History.
4. Keyboard and focus behave like the other two views: focus returns to the rail button on close, and Escape closes.
5. Tests: the default URL shows two rail buttons; with the hook mocked true, a third "Scene" button opens a drawer that renders SceneTools.

## Depends on

The scene side exports `SceneTools` and `useSceneToolsAvailable` and stops drawing those panels over the canvas. That ships with the labeling-tool PR (#38, round 3). Until it merges, build against a stub with the same two names in a test, and open your PR when #38 is in. If #38 misses the 1:30 AM cutoff, the scene side ships `SceneTools` with the scan panel only, and your rail item still works.

Greptile plus one Opus review; the leader merges.

## Update from the #38 session (Round 4)

Scene now draws `SceneTools` itself, in the top-right of the canvas, unless the host says it mounts them. Your rail PR must pass `sceneToolsHosted` to `<Scene>` in `App.tsx` when the rail mounts `SceneTools`:

```
<Scene fixture={fixture} debug={debug} t={t} sceneToolsHosted />
```

Without it the panels would show twice (rail and canvas). The prop is optional and defaults to false; the scene index exports nothing new for it.

## PR #57 round 2 (one fix before merge)

1ae4db3: the rail item itself is right. "Scene" view with its icon, SceneTools from the scene index, the button only while useSceneToolsAvailable() is true, the default rail unchanged, the stale view closing itself, Escape and focus, tests. One CRITICAL from the leader's Opus review. New commits on scene-rail; no force-push.

1. **CRITICAL, `sceneToolsHosted` is always true** (App.tsx:30), but the drawer exists only once a graph has resolved: RightPanel returns early without ContextDrawer (RightPanel.tsx:124-142). `?edit=landmarks` is graphless by design (scene labeling/storage.ts:80-83, Scene.tsx:330 and 362). So the labeling panel and the scan panel would show neither on the canvas nor in the drawer, and the labeling tool is unusable. The same happens for `?manifest=` without a scene, while a graph loads, and after a graph error.
   - Fix: pass `sceneToolsHosted` as true only when the drawer is actually mounted, for example `sceneToolsHosted={resolved !== null}` from the same useGraph() value RightPanel uses, or lift that condition next to RightPanel's early return.
2. **HIGH, no test of the handoff.** Add App-level tests:
   - `?edit=landmarks` (graphless): the labeling panel renders, on the canvas;
   - with a resolved graph and a scan: the canvas overlay is gone and the Scene drawer has SceneTools;
   - never both and never neither.

The leader re-reviews the push; #57 merges after #47.
