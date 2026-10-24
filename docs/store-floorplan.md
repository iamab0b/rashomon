# Plan B store — measured layout, coordinate frame, landmarks, sightline math

This is the contract between Seat B (renders it), Seat A (navmesh, raycasts) and Hazel (landmark labels). Once agreed at the 6 PM contracts session, change it only through A.

See `store-floorplan.svg` for the drawing.

## Coordinate frame

- Units: meters. Y is up (three.js default).
- Origin `(0, 0, 0)`: the inside corner where the **front wall** (street side) meets the **left wall**, at floor level.
- **+X** runs along the front wall to the right, toward the counter.
- **+Z** runs from the front wall into the store, toward the cooler wall.
- Interior: 9.0 m (X) by 7.0 m (Z) by 3.0 m (Y). Walls 0.2 m thick, outside the interior box.
- The floor is the plane y = 0. Eye height for sightlines is 1.6 m; chest 1.2 m.
- The scene GLB has this frame baked in: one unit = one meter, no root transform. If a photogrammetry scan replaces the box model later, it is aligned to this frame, not the other way round.

## Geometry (axis-aligned boxes, min to max in meters)

| Piece | X | Z | Y (height) | Notes |
| --- | --- | --- | --- | --- |
| Front door opening | 1.0 to 2.0 | wall at z = 0 | 0 to 2.1 | 1.0 m clear width; hinged left, opens inward |
| Front window | 3.0 to 7.0 | wall at z = 0 | 0.9 to 2.6 | glass, does not occlude |
| Counter | 7.8 to 8.4 | 1.0 to 4.0 | 0 to 1.0 | customer side faces -X |
| Register | 7.9 to 8.3 | 1.6 to 2.0 | 1.0 to 1.3 | sits on the counter |
| Shelf A (chips gondola) | 2.4 to 3.4 | 1.6 to 5.0 | 0 to 1.8 | the front 0.4 m (z 1.6 to 2.0) is the end-cap display |
| Shelf B (drinks gondola) | 5.0 to 6.0 | 2.0 to 5.0 | 0 to 1.8 | |
| Cooler wall | 1.0 to 8.0 | 6.4 to 7.0 | 0 to 2.0 | glass-door coolers along the back wall |
| Back door opening | 8.2 to 9.0 | wall at z = 7.0 | 0 to 2.1 | staff door |
| Walls | | | 0 to 3.0 | 0.2 m thick, outside the interior |

Typical convenience-store numbers these are based on: gondola shelving 1.8 m (72 in) tall, aisle width 1.2 to 1.8 m, counter 0.9 to 1.1 m tall, door clear width at least 0.815 m (ADA). No tape measure was available Friday; if someone measures a real store, replace the numbers and keep the ids.

## Landmarks (11), as `store.scene.json` will carry them

Position is where an actor stands when "at" the landmark (floor level). Bounds are the occluder box for occluding landmarks and the standing zone for zones.

| id | label | kind | position (x, y, z) | bounds min to max | occludes | aliases |
| --- | --- | --- | --- | --- | --- | --- |
| `front_door` | front door | door | (1.5, 0, 0.4) | (0.9, 0, 0.0) to (2.1, 2.1, 0.6) | false | the door, entrance, street door |
| `window_front` | front window | zone | (4.5, 0, 1.0) | (3.0, 0, 0.3) to (7.0, 2.6, 1.3) | false | the window, by the window, the front |
| `counter` | counter (customer side) | furniture | (7.4, 0, 2.5) | (7.8, 0, 1.0) to (8.4, 1.0, 4.0) | true | the counter, the till, checkout |
| `behind_counter` | behind the counter | zone | (8.7, 0, 2.5) | (8.4, 0, 1.0) to (9.0, 3.0, 4.0) | false | behind the till, where the clerk stands |
| `register` | cash register | prop_spawn | (8.1, 1.0, 1.8) | (7.9, 1.0, 1.6) to (8.3, 1.3, 2.0) | false | the register, the till drawer, cash drawer |
| `shelf_a` | chips shelf | furniture | (1.9, 0, 3.3) | (2.4, 0, 1.6) to (3.4, 1.8, 5.0) | true | the shelves, end cap, end-cap shelf, chips rack |
| `shelf_b` | drinks shelf | furniture | (4.5, 0, 3.5) | (5.0, 0, 2.0) to (6.0, 1.8, 5.0) | true | the middle shelf, soda rack |
| `aisle_chips` | chips aisle | zone | (1.5, 0, 3.5) | (0.6, 0, 1.6) to (2.4, 3.0, 5.0) | false | the first aisle, snack aisle, left aisle |
| `aisle_drinks` | drinks aisle | zone | (4.2, 0, 3.5) | (3.4, 0, 1.6) to (5.0, 3.0, 5.0) | false | the middle aisle, soda aisle |
| `cooler` | cooler | appliance | (4.5, 0, 6.0) | (1.0, 0, 6.4) to (8.0, 2.0, 7.0) | true | the fridge, the coolers, back wall, drinks fridge |
| `back_door` | back door | door | (8.6, 0, 6.6) | (8.0, 0, 6.2) to (9.0, 2.1, 7.0) | false | staff door, stock room door |

Note for the aliases: the extractor matches what witnesses actually say ("the fridge", "the till"), so aliases matter more than labels.

## The planted contradiction, checked by hand

**Claim (e5):** witness in `aisle_chips` at (1.5, 3.5) says she saw the suspect's face while he was at the `counter` (7.4, 2.5).

Ray from eye (1.5, 1.6, 3.5) to chest (7.4, 1.2, 2.5): dx = 5.9, dz = -1.0. At x = 2.4 the ray is at z = 3.35; at x = 3.4, z = 3.18. Both inside Shelf A (z 1.6 to 5.0, height 1.8 > 1.6). **Blocked by `shelf_a`.** It would be blocked again by Shelf B at x 5.0 to 6.0 (z 2.9 to 2.7). Hard flag, check `sightline`, detail names `shelf_a` ("chips shelf").

Suggested question: "From the chips aisle the chips shelf would be between you and the counter. Where were you standing when you saw his face?"

**Correction:** "I had stepped out to the front, by the window." Witness moves to `window_front` (4.5, 1.0).

Ray from (4.5, 1.6, 1.0) to (7.4, 1.2, 2.5): dx = 2.9, dz = 1.5. At x = 5.0 the ray is at z = 1.26; at x = 6.0, z = 1.78. Shelf B starts at z = 2.0, so the ray passes in front of it. The counter is the target, not an obstacle. **Clear.** Status goes `plausible`.

If a photogrammetry scan replaces the box model, re-check these two rays before the demo; a real shelf a few centimeters shorter changes the answer.

## Paths, for the resolver's expectations

| Move | From | To | Straight-line length | Expected navmesh length | Walk (1.4 m/s) | Run (3.5 m/s) |
| --- | --- | --- | --- | --- | --- | --- |
| Suspect enters | `front_door` (1.5, 0.4) | `counter` (7.4, 2.5) | 6.26 m | 6.3 to 7.0 m (skirts the corner of Shelf B at z 2.0) | 4.5 to 5.0 s | |
| Suspect exits | `counter` (7.4, 2.5) | `front_door` (1.5, 0.4) | 6.26 m | 6.3 to 7.0 m | | 1.8 to 2.0 s |
| Witness steps out | `aisle_chips` (1.5, 3.5) | `window_front` (4.5, 1.0) | 3.9 m | 4.5 to 5.5 m (around the end cap) | 3.2 to 3.9 s | |
| Clerk falls | `behind_counter` (8.7, 2.5) | same | 0 | 0 | | |

The straight-line path from the door to the counter passes within 0.1 m of Shelf B's front corner at (6.0, 2.0); a 0.35 m agent radius pushes the navmesh path in front of it. If the resolver returns a path longer than 7.5 m, the navmesh is routing around the wrong side of a shelf.

## Camera presets (for the pitch)

| Preset | Position (x, y, z) | Look at | Use |
| --- | --- | --- | --- |
| Overview | (4.5, 7.5, 9.5) | (4.5, 0, 3.5) | default orbit start, whole store visible |
| Witness POV, claimed | (1.5, 1.6, 3.5) | (7.4, 1.2, 2.5) | the shot that shows the shelf blocking |
| Witness POV, corrected | (4.5, 1.6, 1.0) | (7.4, 1.2, 2.5) | the shot that shows the counter clear |
| Counter close | (5.5, 2.2, 1.0) | (8.0, 1.0, 2.5) | shove and fall |

## Box-model build order (90 minutes, Friday 9 PM)

1. Floor plane 9 x 7 at y = 0; four walls as boxes; ceiling off (open top so the overview camera works).
2. Counter, register, Shelf A, Shelf B, cooler as boxes with the dimensions above; a darker material for the end-cap portion of Shelf A so the demo can point at it.
3. Door and window openings cut as separate wall segments (three boxes per wall), not boolean operations.
4. Export one `store.glb` with named meshes: `wall_front_l`, `wall_front_r`, `door_frame`, `window`, `counter`, `register`, `shelf_a`, `shelf_a_endcap`, `shelf_b`, `cooler`, `wall_back_l`, `wall_back_r`, `wall_left`, `wall_right`, `floor`.
5. Dress with CC0 props after everything else works: bottles on Shelf B, chip bags on Shelf A, a few items on the counter. Dressing is visual only and must not be in the collision set.

The raycast and navmesh use the box meshes only; dressing meshes are tagged `collision: false` in their userData.
