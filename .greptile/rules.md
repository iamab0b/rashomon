# Rashomon review rules

## Scene (apps/web/src/scene)
- No position, path, duration or status may be computed in scene code. The resolver provides world positions, paths and durations; the gate provides statuses. Flag any arithmetic on landmark coordinates, any pathfinding, any time-distance check, and any status assignment inside apps/web/src/scene.
- Animation state is driven only by the single timeline t: action.time is set from t and the mixer is updated with mixer.update(0). Flag crossFadeTo, fadeIn, fadeOut, clock.getDelta used for animation, or any per-frame accumulation that would break scrubbing backward.
- Clips bind by bone name to Mixamo rigs. Flag any retargeting code or any renamed bones.
- Characters are kinematic. Flag any RigidBody on a character; physics is for props only, and playback reads the baked recording, never steps the world on scrub.
- Status rendering: plausible and overridden at full opacity; proposed at 40%; implausible as wireframe at the claimed anchor with no clip; superseded not drawn. Flag deviations.
- Worktree ownership: scene-core owns Scene.tsx, loaders/, characters/, playback/, cameras/, store.ts, index.ts; scene-ui owns timeline/, editing/, export/; scene-props owns props/, overlays/. Flag a PR from one branch that edits another branch's folders.
- Dependencies are pinned in apps/web/src/scene/CLAUDE.md. Flag any new dependency or version change in apps/web/package.json.

## Contracts (packages/schema, packages/engine)
- Anchors reference landmarks by id, never coordinates. Sources arrays are never empty. Confidence is numeric: 0.3/0.6/0.9, mapped in code from the extractor tool's low|medium|high enum. Times are intervals. Flag any change to these types in a PR that is not labeled contracts.
- The plausibility gate is deterministic TypeScript. Flag any call to an LLM or any randomness inside packages/engine.
- Overrides require a reason of at least 10 characters. Flag any path that writes status overridden without one.

## Everything
- No API keys, tokens, webhook secrets or .env contents anywhere in the diff. Flag immediately at the highest severity.
- No code comments; explanations belong in the PR description. Do not flag the absence of comments.
- A PR that says it ran a done-check must include the test or the screenshot. Flag a PR whose description claims a passing check but whose diff has no test for it.
