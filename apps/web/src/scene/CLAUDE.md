# apps/web/src/scene — conventions for agents

You are working on the 3D workspace of Rashomon, a Cal Hacks 13.0 project: witness testimony becomes an editable 3D reconstruction inside measured geometry of a convenience store. This folder renders and edits the scene. Read this file fully before any task.

## The one rule

**No position, path, duration or status is computed in this folder.** The resolver in `packages/engine` turns the event graph into world positions, path points and durations; the gate sets statuses. `scene/` reads `ResolvedGraph` and a timeline `t` and draws. If you find yourself computing where an actor should be, stop: the number belongs in the engine, and the fix is to ask Seat A for it in the resolver output.

The only exceptions: the editor converts a drag end position into an `update_event` patch (anchor by nearest landmark within 0.75 m, else `xyz`), and `gate.preview(graph, scene)` from `packages/engine` may be called locally for red/green feedback while dragging.

## Stack and versions (pinned, do not upgrade)

three 0.186.1 · @react-three/fiber 9.8.2 · @react-three/drei 10.7.9 · React 19.3.x (R3F 9 rejects 19.4+) · @react-three/rapier 2.2.0 (never install rapier yourself; use `useRapier().rapier`) · recast-navigation 0.43.1 + @recast-navigation/three 0.43.1 (Vite: `optimizeDeps.exclude: ['recast-navigation']`) · zustand 5.0.16 · mediabunny 1.62.1

## Coordinate frame

Meters, Y up. Origin at the store's inside front-left corner at floor level; +X along the front wall toward the counter; +Z into the store toward the cooler. Interior 9 x 7 x 3 m. Eye height 1.6, chest 1.2. The scene GLB is already in this frame with no root transform. The landmark map (`SceneManifest`) is `storeScene` from `@rashomon/schema/fixtures` in fixture mode.

## Files and ownership (three worktrees, one agent each)

- `scene-core` (Claude Code): `Scene.tsx`, `loaders/`, `characters/`, `playback/`, `cameras/`, `store.ts`, `index.ts`. Owns the public exports.
- `scene-props` (Antigravity): `props/` (library loader, PropInstance, Physics, baked recording), `overlays/`.
- `scene-ui` (Cursor): `timeline/`, `editing/`, `export/`.

Only edit files in your worktree's folders. If you need something from another folder, write the interface you need in a comment at the top of your file and stop; Sahil wires it at merge.

## Public exports (what `apps/web/src/ui` is allowed to import)

`<Scene fixture?: string />`, `<Timeline />`, `useGraph()`, `useSelection()`, `useCamera()`, `useTimeline()` from `src/scene/index.ts`. Nothing else is imported from `scene/` internals.

## Playback model

One `t` (seconds) in the zustand store. Everything derives from `t` in `useFrame`. For each resolved event: position = path curve at arc-length fraction `(t - tStart) / (tEnd - tStart)`; facing = curve tangent, slerped over 0.3 s; clip time per the action map; blend weights computed by hand from overlap windows; then `mixer.update(0)`. Never use `crossFadeTo`, `fadeIn`, `fadeOut`, or the clock delta for animation state; scrubbing backward must work.

## Status rendering

`plausible`, `overridden`: full. `proposed`: 40% opacity. `implausible`: no clip; wireframe outline at the claimed anchor with a red badge. `superseded`: not drawn. `overridden` also shows an amber badge. Flags render as a `<Line>` from the observer eye to the target for `sightline` flags, red if blocked, green if clear.

## Clip-to-action map

The clip table is `docs/clip-action-map.md`; `characters/actionMap.ts` carries it as data. Characters are Mixamo Y Bot (witness, suspect) and X Bot (clerk) from `public/characters/` (`ybot.fbx`, `xbot.fbx`); clips from `public/clips/`, one `clip_<name>.fbx` each, bound by bone name. All of them are FBX loaded with three's `FBXLoader` at scale 0.01 (Mixamo exports centimeters). Hip bone after FBXLoader is `mixamorigHips`. Each rig loads with two skeletons, one a duplicate chain nested under the other; the mixer root is the SkinnedMesh with the primary skeleton (`findPrimarySkinnedMesh` in `characters/rigs.ts`). Every clip has its `mixamorigHips.position` X/Z zeroed at load in `characters/clips.ts` (Y is kept), so no clip carries root motion and the actor stays on the resolver path. Props attach to `mixamorigRightHand`.

## Physics (props only)

`<Physics paused timeStep={1/60}>`. Collision meshes are the box-model pieces tagged `userData.collision !== false`; dressing meshes are excluded. Characters are kinematic (no rigid bodies). After any graph change, step the world from `t = 0` and record every prop's transform per frame; scrubbing plays the recording. Props: `cuboid`, `ball` or `hull` colliders; `ccd` on anything thrown.

## Testing and screenshots

`pnpm -F web shot -- --fixture store --t 12 --cam witness_claimed` (the harness opens `?fixture=store&t=12&cam=witness_claimed`; the robbery graph loads by default in fixture mode) renders a PNG to `apps/web/shots/`. Look at it before saying a visual task is done. `pnpm -F web test` runs Vitest on `actionMap`, `playback` math and the patch emitter. Both must pass before a merge.

## Fixtures

`storeScene` (11 landmarks) and `robberyGraph` (3 actors, 10 events, 2 props), both imported from `@rashomon/schema/fixtures`. The resolved version for render tests is `robberyResolved` from `@rashomon/schema/fixtures` (typed as its JSON; cast it to the engine's `ResolvedGraph` at the import site), regenerated from the resolver and pinned by the engine's drift test. Expected after the gate: `e5` implausible with a `sightline` flag blocked by `shelf_a`; everything else plausible. If your render shows the witness seeing the counter from the chips aisle, something upstream is wrong, not your code.

## Style

TypeScript strict. Function components, hooks, no classes except three subclasses. No comments inside code blocks you emit in chat; explanations go in prose. Small files; one component per file. Do not add dependencies without asking.
