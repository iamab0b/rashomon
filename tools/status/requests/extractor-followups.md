# Extractor follow-ups after PR #7 (from Sahil)

PR #7 merged at 12:24 AM with Greptile at 1/5 and no review, and a post-merge review reproduced all six of Greptile's findings. The prop-id rule is the blocker: the scene, the gate and the SpacetimeDB module all resolve `prop` by instance id, so a reference by type silently loses the knife.

Paste into your Claude Code session. Create a branch `extractor-fixes` from origin/main and open a PR to main titled "extractor: validation, guards and minted prop ids". Push with `git push -u origin extractor-fixes`, with no force-push. Do not merge it yourself: Sahil's leader session reviews and merges, and main is never merged into without review. PR #7 went in at 12:24 AM with Greptile at 1/5 and no review; this PR closes what that left open.

Read first:
- tools/status/requests/extractor-patch-shape.md on main. Its time rules changed tonight: `t` is `[number, number]` in seconds from the incident start, and always present on add_event, with `tConfidence: "inferred"` when the witness gave no time.
- packages/schema/src/index.ts (Patch, Event, Anchor)
- packages/schema/CLAUDE.md
- .greptile/rules.md

Change only packages/extractor/. Every fix gets a test that fails on main today. The leader's reviewer reproduced each one.

1. Minted prop ids. The contract says same-batch references use extractor-minted ids, never prop types.
   - prompt.ts line 21 (rule 11) tells the model to reference props by type, and extractor.test.ts lines 219 to 232 assert that `prop: "knife_chef"` passes.
   - After extraction, mint `p_<type>` for each new prop in the session, then `p_<type>_2`, `p_<type>_3`, never reusing an id that is already in the graph. Rewrite every same-batch reference to the minted id.
   - Update the prompt rule and that test.
   - The schema type for an id on add_prop lands with PR #9 (spacetime-followups). Until it merges, carry the id with a single typed helper rather than scattered casts, and say so in the PR.
2. validate.ts line 145. An add_event whose `prop` names no existing instance and no add_prop in the batch is accepted, and localGraph.ts lines 199 to 203 keep the raw reference. Reject it with a message naming the prop.
3. validate.ts lines 288 to 293. An update_prop with `held_by: null` is dropped, giving "changed nothing", so a holder can never be cleared. A `null` in changes clears the field.
4. validate.ts lines 235 to 239. Partial time updates on `[10,20]`, first `t_start: 5` and then `t_end: 30`, emit `[5,20]` and then `[10,30]`; the second undoes the first. Apply partial updates to the latest interval in the batch, so the result is `[5,30]`. Reject `t_start > t_end`.
5. extract.ts lines 45 to 46. A response with `stop_reason: "max_tokens"` is treated as complete. If stop_reason is anything other than `tool_use` or `end_turn`, return the parsed patches and also mark the result incomplete, so the caller can retry or warn. Test the max_tokens case.
6. guards.ts lines 114 to 167. isPatch accepts update_event with `changes.t: "oops"`, add_actor without role or rig, and an `xyz` coordinate anchor at line 93. The contract says anchors are by landmark id, never coordinates.
   - Validate the types inside `changes`.
   - Require every add_actor field.
   - Reject `xyz` anchors from the extractor. The schema allows xyz only for the editor's drag fallback.
7. localGraph.ts line 239. A retraction sets superseded and drops the retract patch's `sources`. Keep them: append them to the event's sources and set `supersededBy` to the first retracting source. Statuses are the engine's job, so do not set `status` here once PR #11 (engine-override) is on main. Until then, keep superseded and say so.
8. localGraph.ts lines 25 to 26 and line 46 force `p${n}` and `e${n}` ids, overwriting ids the patch supplies. Now that the schema's add_event and add_prop accept an optional `id` (PR #9), keep a supplied id, and mint only when none is given. Otherwise the local CLI path (cli.ts line 64) drops the minted `p_<type>` ids from step 1. Test that a supplied `p_knife_chef` survives.
9. Add a test that runs the extractor on a recorded real-model response for the robbery's first segment. Use a JSON fixture under packages/extractor/fixtures/ with no key in it. Check that the output parses as Patch[] through the guard, every event has sources, every confidence is in {0.3, 0.6, 0.9}, every anchor is a storeScene landmark id, and same-batch prop references use minted ids.

Done-check:
- `pnpm -r typecheck` and `pnpm -r test` pass.
- No code comments.
- `git grep -nE "sk-ant-"` prints nothing.
- The PR description lists each fix and its test.

`/team-status` closes this item when a file under `packages/extractor/src/` mints prop ids with a `p_${` template.
