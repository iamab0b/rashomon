# Request: the extractor knows who is speaking

From Sahil, Sat 9:25 PM, found in Hazel's #47. For Eric (packages/extractor; the module's call in spacetimedb/server/src/extract/run.ts).

## The bug

submit_statement and the webhook store each segment with a `witnessId`, but the extraction prompt never says who that witness is. Prompt rule 3 (packages/extractor/src/prompt.ts:16) says only that "I" and "me" are "the witness actor". With two witnesses, "I" in the clerk's statement can map to the customer.

The data is already there. `Witness` in packages/schema/src/index.ts has `{ id, label, actorId? }`, and `EventGraph.witnesses` lists them. The clerk fixture (packages/schema/fixtures/robbery.clerk.json) is witness `w2`, label "Clerk", actorId `clerk`.

## What to change

1. The prompt receives the speaking witness's id, label and actorId, taken from the segment's witnessId and the graph's witnesses. For example: "The witness speaking is w2 (Clerk). In this statement, I, me, my and myself refer to actor clerk."
2. When the witness has no actorId yet (a new witness), say so. The model should then add the speaker as a new actor with role witness, and the module links it, or it records first-person events against the witness's existing actor if one is named. Pick one, say which in the PR, and test it.
3. The validator rejects an event whose actor is another witness's actor when the statement only uses first person for it. Keep this a light check: flag and drop, counted like other drops. Don't add a contract change.
4. Rule 3 in prompt.ts changes to match. Update PROMPT_HASH as usual.

## Tests (faked model)

- **Clerk:** the clerk fixture statement "I was behind the counter when he grabbed the chips" is extracted with actor `clerk` for "I", never the customer actor.
- **Customer:** the customer's statement on the same graph still maps "I" to the customer.
- **Prompt:** the prompt text contains the speaker's id, label and actor id.
- **No actorId:** a witness without an actorId follows the rule from item 2.

## Also in this PR: a relocation carries forward (found in Hazel's live check, hazel1)

On the robbery fixture, the correction statement ("Oh. No, you're right, I'd stepped out. I came to the front by the window to see what was going on. I saw him from there.") should give the 4 patches in packages/schema/fixtures/robbery.graph.json (correction) and apps/web/src/scene/playback/recordedStatements.ts:
- NEW e11, a walk to the window;
- CHANGED e3;
- CHANGED e5, at window_front;
- CHANGED e9, the witness's crouch 13–24, `at: window_front`.

Live, the model gave the first three and skipped e9, so the witness is back at aisle_chips for the crouch with no walk back.

- Prompt rule 8 (packages/extractor/src/prompt.ts) gains this: "When the witness corrects where they were, apply the new place to their later events that were placed at the old place, until they describe moving again. Use update_event on each of those events." It's still only what the witness said: they said they saw him from there and described no move back.
- Test (faked model): the prompt contains the rule. And a recorded tool-use set for the correction that includes the e9 update, the shape recordedStatements.ts already uses, validates and applies to the fixture with e9 at window_front and plausible.
- Live check (Hazel, after the publish): the correction on a fresh scratch session gives 4 patches, including CHANGED e9.

Coordinate with the strict-schema fix in #48 (extractor-union-limit). Branch from main after it merges, or rebase onto it. Branch extractor-speaker, PR to main, Greptile plus Opus and Sonnet.
