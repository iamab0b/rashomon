# Extractor output must be the schema's Patch[] (from Sahil)

The scene, the gate and the SpacetimeDB reducers all consume `Patch` from `packages/schema/src/index.ts`. If your extractor emits anything else, nothing downstream can read it, so this is the one contract between us.

## What to match

- `Patch` with ops `add_event`, `update_event`, `retract_event`, `add_prop`, `update_prop`, `add_actor`. Field names exactly as the type says.
- Every event's `sources` array is non-empty (utterance ids from the segment).
- `confidence` is one of `0.3`, `0.6`, `0.9` (the enum low|medium|high mapped to those numbers; the fixture test on main enforces it).
- Anchors reference landmarks by id from `packages/schema/fixtures/store.scene.json`, never coordinates. Kinds: `at`, `near`, `behind`, `between`.
- Times are intervals `{start, end}` in seconds relative to the segment, or absent when the witness gave none (the resolver infers them).

## Prove it

A Vitest in `packages/extractor/` that runs your extractor on `examples/01-*.input.json` from your pack and asserts the output parses as `Patch[]` through a type guard, every event has sources, and every confidence is in the set. Import `storeScene` and `robberyGraph` from `@rashomon/schema/fixtures` rather than copying them.

`/team-status` closes this item when a file under `packages/extractor/` contains `add_event`.
