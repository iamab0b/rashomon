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
