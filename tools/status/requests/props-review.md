# Review props.json (from Sahil)

The skeleton generated `packages/props/props.json` from `docs/props-shopping-list.md`. The dimensions are from the list; `massKg`, `collider`, `gripOffset` and the `aliases` were guessed by the agent and every `source` is an empty string. The props library on scene-props is being built against this file tonight, so wrong values become wrong 3D sizes.

## What to do

For each of the 12 entries: confirm or correct `dimensionsM` and `massKg` against a real product page or spec, put that URL in `source`, pick `collider` from `cuboid|ball|hull`, set `gripOffset` in meters from the model origin to where a hand holds it (graspable items only), and give three to five `aliases` the way a witness would say it ("a big knife", "the gun", "his bag"). Keep `defaultNotes` to one sentence a judge could read on screen.

Commit on a branch and open a PR; `/team-status` closes this item when `props.json` has at least one `https://` source. The GLB files themselves are my lane (`docs/props-shopping-list.md`).
