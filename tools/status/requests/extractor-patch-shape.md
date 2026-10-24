# Extractor output must be the schema's Patch[] (from Sahil)

The scene, the gate and the SpacetimeDB reducers all consume `Patch` from `packages/schema/src/index.ts`. If your extractor emits anything else, nothing downstream can read it, so this is the one contract between us.

## What to match

- `Patch` with ops `add_event`, `update_event`, `retract_event`, `add_prop`, `update_prop`, `add_actor`. Field names exactly as the type says.
- Every event's `sources` array is non-empty (utterance ids from the segment).
- `confidence` is one of `0.3`, `0.6`, `0.9` (the enum low|medium|high mapped to those numbers; the fixture test on main enforces it).
- Anchors reference landmarks by id from `packages/schema/fixtures/store.scene.json`, never coordinates. Kinds: `at`, `near`, `behind`, `between`.
- Times are `t: [number, number]`, a two-number tuple in seconds, exactly as the schema types it. Never `{start, end}`. Set `tConfidence` to `stated` or `inferred`.
- Same-batch references use extractor-minted ids, never prop types. When one batch adds a prop and an event that refers to it, mint the prop's id as `p_<type>` (for example `p_knife_chef`), then `p_<type>_2`, `p_<type>_3` for further props of the same type in the session, and put that id on `add_prop` and in the event's `prop`. The SpacetimeDB module keeps client-supplied ids; the schema type for an id on `add_prop`/`add_event` lands with the spacetime-followups PR.

## Prove it

A Vitest in `packages/extractor/` that runs your extractor on `examples/01-*.input.json` from your pack and asserts the output parses as `Patch[]` through a type guard, every event has sources, and every confidence is in the set. Import `storeScene` and `robberyGraph` from `@rashomon/schema/fixtures` rather than copying them.

`/team-status` closes this item when a file under `packages/extractor/` contains `add_event`.
