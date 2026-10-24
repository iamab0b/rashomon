# Demo scenario — the witness statement and what the scene must show

Hazel owns the pitch version. This is the working script Seat B and Seat C build against; utterance ids match `fixtures/robbery.graph.json`.

## Setting

A corner convenience store, early evening. Three people: the clerk (behind the counter), the suspect (enters by the front door), the witness (a customer in the chips aisle). The witness is interviewed afterward.

## The statement, in her words (live interview or typed)

| utt | Witness says | Events it produces |
| --- | --- | --- |
| utt_1 | "I was in the first aisle, the snack one on the left, looking at the chips." | e3 witness stand at `aisle_chips`, facing `shelf_a` |
| utt_2 | "A guy came in the front door and went straight up to the counter. The clerk was behind the till." | e1 suspect walk `front_door` to `counter`; e2 clerk stand `behind_counter` |
| utt_3 | "He said something to the clerk, I couldn't hear what at first." | e4 suspect speak, target clerk |
| utt_4 | "Then he got loud. 'Open it, open it.' Like that." | e4 (same event, confidence up) |
| utt_5 | "He had a knife. A kitchen knife, maybe eight inches. He pulled it out of his jacket." | p_knife prop, held by suspect; e6 pick_up |
| utt_6 | "That's when I looked up." | e5 witness look, target suspect, from `aisle_chips` |
| utt_7 | "I saw his face clearly. White guy, thirties, dark hoodie." | e5 (the claim the gate will test) |
| utt_8 | "He shoved the clerk, hard, and the clerk went down behind the counter." | e7 suspect shove clerk; e8 clerk fall at `behind_counter` |
| utt_9 | "I got down. I crouched behind the shelf." | e9 witness crouch |
| utt_10 | "Then he ran out the front, same way he came in." | e10 suspect run `counter` to `front_door` |
| utt_11 | "The whole thing was maybe twenty, thirty seconds." | timing context for the resolver |

## Where the gate speaks (the demo moment)

After utt_7 the gate flags e5: from `aisle_chips` the ray to the counter hits `shelf_a`. The event turns red, the agent asks:

> "From the chips aisle, the chips shelf would be between you and the counter. Where were you standing when you saw his face?"

| utt | Witness says | Patch |
| --- | --- | --- |
| utt_12 | "Oh. No, you're right, I'd stepped out. I came to the front by the window to see what was going on. I saw him from there." | e5 moves to `window_front`; new walk event `aisle_chips` to `window_front` at t 8 to 11; e3 shortened to t 0 to 9; e9 crouch moves to `window_front` |

The gate re-runs; e5 turns green; the animation replays with the witness at the window. POV camera from (4.5, 1.6, 1.0) shows the counter clear.

## What the scene must show, in order (for the demo video and the live pitch)

1. Overview camera: the store, landmarks labeled, three idle actors.
2. e1 plays: suspect walks door to counter (about 5 s), clerk idle behind the counter, witness idle in the chips aisle facing the shelf.
3. e4 and e6: suspect talks, then the pick-up clip; the knife appears in his right hand with a dimension overlay (203 mm blade).
4. e5 as claimed: the witness look clip plays as a wireframe outline (implausible); a red sightline ray from her eye stops at `shelf_a`; the flag badge shows the suggested question.
5. The correction lands: a new walk event moves her to the window; e5 is now solid; the ray is green and reaches the suspect's chest. POV camera cut.
6. e7, e8: the push clip on the suspect, the shoved reaction then the fall on the clerk; the clerk stays down.
7. e9, e10: the witness crouches by the window; the suspect runs out, passing within half a meter of her.
8. Investigator drags the suspect's entry anchor to `back_door`; the path re-resolves, the gate re-runs, the scene re-renders from the new graph. Then an override dialog on any implausible event, with the reason typed, shows the amber badge.

Total runtime of the reconstruction: about 25 seconds at 1x. The pitch scrubs; the video plays it through once.

## Things the witness says that the extractor must handle

- "the first aisle, the snack one on the left" must resolve to `aisle_chips` through aliases, not a new landmark.
- "the till" is `counter` or `register` depending on verb: "behind the till" is `behind_counter`; "open the till" refers to `register`.
- "maybe eight inches" becomes the knife prop's note, not a dimension change.
- "twenty, thirty seconds" is an interval `[20, 30]` on the whole incident, which the resolver uses to sanity-check the sum of event durations, not an event.
- "White guy, thirties, dark hoodie" is not an event and must not become one; it goes in the actor's notes. Faces are never rendered.
