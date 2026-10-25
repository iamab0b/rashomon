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


## PR #58 round 2 (Sahil, from clip2): a correction that moves a placed event emits the walk and shortens the stand

#58 (49007df) carries the speaker section, rule 3, the validator check and rule 8's carry-forward sentence; the leader's reviews are running on it. Sahil's clip2 shows one more gap: after the correction, e5 is at window_front and plausible, but **no walk was added and e3 wasn't shortened**. e3 and e5 then carry the same soft contradiction (the witness is in two places 3.9 m apart at t=10.5): that's the teleport and the double flag. Hazel's run got the walk and Sahil's didn't, so the extractor is inconsistent on relocation. New commits on extractor-speaker; no force-push.

1. **The rule:** when the witness says they moved ("I came to the front", "I went over to"), a correction that moves an event they had placed must also:
   - **add the walk** from the old place to the new one (add_event walk, from the earlier event's place to the new place, timed between them);
   - **shorten the earlier stand** (update_event on e3) so it ends when the walk starts.
   Rule 8's current wording ("add or adjust the movement events around it only if the witness described that movement") covers this, because "I came to the front by the window" describes the movement. Make it explicit and not optional: "If the witness describes moving to the new place, add that walk and end their earlier event where the walk starts."
2. **Recorded tool-use test:** a recorded correction tool-use set without the walk or the e3 update is flagged as incomplete by a validator check: a relocation update with no connecting movement for the same actor. It should be a soft warning in `unparsed` or a returned note, not a drop.
3. **The full recorded set:** add_event walk, e3 shortened, e5 moved and e9 moved. It validates to the fixture's 4 patches, and after applying them e3 and e5 carry no contradiction flag.
4. Live check (Hazel and Sahil, after the publish): the correction on two fresh scratch sessions, twice each, gives the walk and the shortened e3 every time.

### Round 2 also (Sonnet review of 49007df): live witnesses have no actor, so the new wording can make live worse than main

5. **HIGH, live regression risk.** The module builds live witnesses as `{ id, label: id, actorId: undefined }` (spacetimedb/server/src/graph.ts:29). So on every live session the prompt says "w1 … has no actor yet", and the model may call add_actor "w1" (role witness) when the `witness` actor already exists. That's a duplicate actor, with the customer's "I" events split across two actors. The validator check (validate.ts:157) never fires live, because it needs actor ids.
   - Fix, smallest safe version:
     - When a witness has no actorId, keep main's behaviour: rule 3's plain "I is the witness actor", and no "no actor yet" sentence. Add the speaker sentence only when an actorId is known.
     - In spacetimedb/server/src/graph.ts `buildGraph` (Sahil's area; he approves this in review), derive each witness's `actorId` from its own events: the single actor with role "witness" among the events carrying that witnessId. Set its `label` to that actor's label. If there's none, or more than one, leave both as today. No table change. (Opus review: this is what makes the speaker sentence and the validator check work live; today they work only in the fixture and tests.)
     - Say in the PR exactly what live mode now resolves.
   - Test: a module-built graph whose w1 events use the `witness` actor gives w1 actorId `witness` and its label, plus the speaker sentence. A statement typed under another name, for example "Maria", then still resolves "I" to `witness`. A graph with no witness-role actor gives no "no actor yet" wording, and the prompt equals main's for that case.
6. **MEDIUM, a revert check that doesn't fail.** Deleting run.ts:140, the `graph.witnesses` pass-through, leaves all server tests passing, because procedure.test.ts:168 matches the fallback text. Assert a case where the witness has a label or actorId, so the pass-through is tested.
