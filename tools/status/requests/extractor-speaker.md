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

Coordinate with the strict-schema fix in #48 (extractor-union-limit). Branch from main after it merges, or rebase onto it. Branch extractor-speaker, PR to main, Greptile plus Opus and Sonnet.
