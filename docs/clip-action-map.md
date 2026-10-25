# Clip-to-action map

The `Action` enum in `packages/schema` is the contract; this table says what the renderer does for each verb. It goes into `apps/web/src/scene/CLAUDE.md` at the bell and into `src/scene/characters/actionMap.ts` as data.

Clips are the Mixamo FBX downloads in `apps/web/public/clips/` (`clip_<name>.fbx`), loaded with three's `FBXLoader` at scale 0.01. There is no Blender or GLB conversion step. Root motion is stripped at load: hips X/Z are zeroed and Y is kept, so every clip plays in place and the resolver owns the actor's position.

| Action | Clip (FBX) | Loop | Root motion | Duration source | Blend in / out (s) | Facing | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `stand` | `clip_idle` | yes | none | event `t` | 0.2 / 0.2 | `facing` landmark if set, else keep last | default state between events |
| `walk` | `clip_walk` | yes | path from resolver, speed = path length / duration | event `t` (resolver infers from 1.4 m/s if unstated) | 0.25 / 0.25 | path tangent | clip plays in place; root follows the path curve |
| `run` | `clip_run` | yes | path, speed = length / duration | event `t` (3.5 m/s default) | 0.15 / 0.15 | path tangent | if speed > 6 m/s the gate already flagged it |
| `crouch` | `clip_crouch_idle` | yes | none | event `t` | 0.3 / 0.3 | keep | witness hiding |
| `fall` | `clip_fall_back` | no, hold last frame | none | clip length (about 2 s), clamp to `t` | 0.1 / hold | keep (stretch: turn away from `target` or shover) | stays down until the actor's next event of any kind |
| `shove` | actor: `clip_push`; target: `clip_shoved` | no | none | clip length, clamp to `t` | 0.1 / 0.2 | actor faces `target`; target faces actor | the target clip starts 0.3 s after the actor clip |
| `punch` | actor: `clip_punch`; target: `clip_shoved` | no | none | clip length | 0.1 / 0.2 | face each other | same pairing as shove |
| `pick_up` | `clip_pick_up` | no | none | clip length (about 2.5 s) | 0.2 / 0.2 | toward `prop` anchor | at 60% of the clip, attach the prop to `mixamorigRightHand` |
| `drop` | `clip_idle` | yes | none | 0.5 s | 0.2 / 0.2 | keep | detach prop, hand it to physics with the hand's velocity |
| `throw` | `clip_throw`, else `clip_punch` | no | none | clip length | 0.1 / 0.2 | toward `target` or `to` | detach at 40%, give the prop 6 m/s toward the target |
| `open_door` | `clip_open_door`, else `clip_idle` | no | none | 1.5 s | 0.2 / 0.2 | toward the door landmark | stretch; door mesh rotation is a separate tween |
| `look` | `clip_look_around` | yes | none | event `t` | 0.3 / 0.3 | toward `target` actor | the sightline ray draws during this event |
| `speak` | `clip_talk` | yes | none | event `t` | 0.3 / 0.3 | toward `target` | |
| `hands_up` | `clip_hands_up`, else `clip_idle` | yes | none | 1.5 s | 0.2 / 0.2 | `facing` or `target` if set, else keep | |
| `point` | `clip_pointing`, else `clip_idle` | no | none | 1.5 s | 0.2 / 0.2 | toward `target` | |
| `reach` | `clip_reach`, else `clip_pick_up` | no | none | 1.5 s | 0.2 / 0.2 | `facing` if set, else keep | `pick_up` keeps `clip_pick_up` |
| `kneel` | `clip_kneel`, else `clip_crouch_idle` | no, hold last frame | none | 2 s | 0.2 / hold | keep | stays down until the actor's next event, like `fall` |
| `stumble` | `clip_stumble_back`, else `clip_shoved` | no | none | 2 s | 0.1 / 0.2 | keep | |
| `jump` | `clip_jump_over`, else `clip_idle` | no | none | 1.5 s | 0.1 / 0.2 | `facing` if set, else keep | at an anchor; not a movement, the resolver does not move the actor |
| `phone` | `clip_phone`, else `clip_talk` | yes | none | 4 s | 0.3 / 0.3 | keep | |
| `drink` | `clip_drink`, else `clip_idle` | yes | none | 3 s | 0.3 / 0.3 | keep | |
| `dodge` | `clip_dodge`, else `clip_crouch_idle` | no | none | 1.5 s | 0.1 / 0.2 | keep | |

Durations are the resolver's when the witness gave no time (`FIXED_DURATION_S` in `packages/engine/src/resolve/time.ts`). Every clip above that is not in the original twelve is optional: a missing file falls back to the clip after "else" through `chooseClip`, and the load logs it once without a warning.

## Styles

An event's optional `style` picks a variant clip on the same action. A style is valid only with its own action; the extractor and the module refuse it on any other. A change of action drops a style that no longer fits, in the module and in both local patch paths, and `update_event` with `style: null` clears it (the extractor's tool spells that `none`). When the variant file is missing, the action's own clip plays.

| Style | Action | Clip (FBX) | Falls back to |
| --- | --- | --- | --- |
| `sneak` | `walk` | `clip_sneak` | `clip_walk` |
| `scared` | `run` | `clip_run_scared` | `clip_run` |
| `forward` | `fall` | `clip_fall_forward` | `clip_fall_back` |
| `outward` | `open_door` | `clip_open_door_out` | `clip_open_door`, else `clip_idle` |
| `behind` | `look` | `clip_look_behind` | `clip_look_around` |

## Approximated verbs

When the witness's verb is not one of the actions, the extractor picks the nearest action, sets `actionApproximated` and keeps the witness's word in `verb` (at most 40 characters), for example `dodge` from "ducked". The gate judges it like any other event of that action. The timeline draws its block with a dashed outline (`2 3`), and the block carries `data-approximated` and `data-verb`; the resolved event carries `actionApproximated` and `verb` for the event card.

Required clips load first and playback starts on them; the optional files load in the background and each actor switches to them once they settle. `?debug=rig` plays each new clip on the Y Bot from 12 s, one every 3 s, and its panel lists each clip with its window and, when the file is missing, the clip that plays instead.

## Rules the agent must follow

- Blend weights are computed by hand from the overlap windows and set every frame from the single timeline `t`. Never call `crossFadeTo`, `fadeIn` or `fadeOut`; they hold real-time state and break scrubbing backward.
- `action.time = (t - tStart) % clipLength` for looping clips; `min(t - tStart, clipLength)` for one-shot clips. Then `mixer.update(0)`.
- Two events on the same actor that overlap in `t` blend by overlap fraction. Three or more overlapping is a resolver bug; render the latest and log a warning.
- Status drives material, not animation: `plausible` and `overridden` play normally; `proposed` plays at 40% opacity; `implausible` does not play, it draws a wireframe of the actor at the claimed anchor; `superseded` is not drawn.
- Props attach to `mixamorigRightHand` with a per-prop grip offset from `props.json`. The knife's grip offset puts the blade forward of the fist by 0.08 m.
- Facing is a quaternion slerp over 0.3 s toward the target direction, never a snap.
