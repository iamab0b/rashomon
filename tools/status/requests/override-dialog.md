# Override dialog (from Sahil)

The override is the "investigator decides" half of the plausibility gate and is in the demo script: e5 is flagged implausible, the investigator either corrects the anchor or overrides with a reason.

## Spec

In `apps/web/src/ui/`: a dialog opened from a flagged event (the scene exposes `useSelection()` from `apps/web/src/scene`; the flags come from the resolved graph's events). It shows the event's text, its flags with their `suggestedQuestion`, and a reason field. The reason must be at least 10 characters before the confirm button enables (the schema's `Override` type and the gate both require it). On confirm it emits an `Override` through a callback prop; in fixture mode the callback applies it locally and the event renders as `overridden` (full opacity, amber badge). Dark theme, matches your design brief.

Build against `robberyResolved` from `@rashomon/schema/fixtures`. A Vitest that the button stays disabled under 10 characters is enough.

`/team-status` closes this item when a file under `apps/web/src/ui/` contains `reason`.
