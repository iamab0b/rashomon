# Pitch script: 3 minutes, plus the 2-minute demo-first cut

Hazel presents, Sahil drives, A takes technical questions, Eric stands by on voice. About 420 words for the 3-minute version. Based on the prep pack's script, updated Sat 1 PM to what main actually does. Bracketed lines are the community call's quotes. Lines in *italics* are what is on screen; quoted UI text is exactly what the app shows.

Demo URLs (Sahil's laptop, `localhost:5173`):
- Fixture, the default: `/`
- The catch, ready to show: `/?t=11`
- The corrected statement, as a backup only: `/?scenario=corrected&t=11`
- Live fallback, no local server needed: `/?mode=live&stdb=wss://maincloud.spacetimedb.com&db=rashomon&session=demo`. If we demo live, open this tab before the pitch starts (about 7 s to load).

## 3-minute version

**0:00 · The problem (20 s)**
"[Quote from the investigator about statements and the room.] Eyewitness testimony is the most common evidence there is and the least checkable. A witness talks, it becomes a paragraph, and nobody checks that paragraph against the room until trial, if ever."

**0:20 · What we built (20 s)** *Overview of the store, landmarks labeled.*
"Rashomon turns testimony into events anchored to a measured model of the real place. Every event cites the sentence it came from. And the room decides what is possible: a sightline, a path or a timing the geometry rules out is never animated as fact."

**0:40 · The loop (30 s)** *Sahil plays from t = 0; Hazel narrates only what is on screen.*
"A customer in the chips aisle. The suspect comes in the front door and walks to the counter; the clerk is behind it." *Events tab: each card shows time, person, action and place, with its source sentence underneath.* "Every one of these came from a sentence she said."

**1:10 · The catch (40 s)** *Playhead to 11 s. The witness turns into a wireframe ghost with a red badge; the red ray stops at the chips shelf.*
Witness: "I saw his face clearly from the chips aisle when he pulled the knife."
"Watch the sightline." *Flags tab:* "Under the current scene geometry, the sightline is blocked by the chips shelf."
**[20-second voice slot, Eric's path]** The agent asks the flag's question aloud: "From the chips aisle, the chips shelf would be between you and the suspect. Where exactly were you standing when you saw that?" Witness: "Oh. I'd stepped out to the front, by the window."
*Correction, done as a drag (this is the catch moment): Sahil drags e5's gizmo to the front window. The ghost and badge go, the ray turns green, and the gate's follow-up question appears right after; pause on it.*
"The event moves. The ray is clear. Nothing was faked and nobody was judged: the room asked the question."

**1:50 · Investigator control (25 s)** *Back on `/`. Override on e5, type a reason, "Apply this override?", Confirm override; the amber badge stays. Open History.*
"The investigator stays in charge. Accepting something the room rules out takes a written reason and a second confirmation, and the amber badge stays. History keeps the whole story: the original finding, who overrode it and why, and where it stands now. Every change is a patch with a source."

**2:15 · Props and witnesses (15 s)** *The knife in the suspect's hand.*
"Objects the witness names appear at their real size, in the hand that holds them. A second witness becomes a second layer, and where two statements differ you get a flag, not a verdict. That layer is next."

**2:30 · Who it is for and what it is not (20 s)** *Guardrails card.*
"[Second quote: the investigator's worry.] This is a demonstrative aid that tests hypotheses, not a simulation that reaches conclusions. A human decides every accept and override. Every element has a source. Uncertainty is drawn as uncertainty. There is no credibility score anywhere. Every export says: AI-assisted illustration, not a recording."

**2:50 · Stack (10 s)** *Stack card.*
"Claude Sonnet turns speech into events. A Cartesia agent runs the interview. SpacetimeDB holds one shared world, and the room's verdict commits in the same transaction as the claim. Three.js on measured geometry."

## 2-minute demo-first cut (every sponsor judge)

1. **The catch (40 s):** start at 1:10 above, voice audible if Eric's path is live.
2. **What you just saw (20 s):** a measured scene, a gate that checks sightlines, paths and timing, and a source on every event.
3. **How it's built (20 s):** the stack paragraph with the sponsor's piece first. Cartesia: Ink in, Sonic out, the webhook returns the flags mid-turn. SpacetimeDB: the gate commits in the same transaction as the claim. Anthropic: strict-tool extraction, and where it could go wrong. Microsoft: production path, override log, responsible design.
4. **Who it is for (20 s):** with the quote.
5. Stop and take questions.

## If something breaks on stage

- Fixture looks wrong: switch to the live URL above. Maincloud's demo session starts at the same state (e5 implausible).
- Voice is not up: Sahil types the witness line and the corrected statement; say "the agent asks", never "live voice".
- e5 will not select at 11 s: press "Next flag", which selects it and moves the playhead.

## Judge questions, one-line answers

- *Isn't this a lie detector?* No. It checks claims against geometry and against each other, never people; honest witnesses misjudge distance and time constantly. There is no credibility score in the product.
- *Why not just generate a video?* A generated video is a persuasive fiction with invented distances. Ours can be wrong in a checkable way, and it refuses to draw what the room rules out.
- *Would a court allow it?* California's Duenas decision admits demonstrative animations that fairly represent the evidence; simulations that reach conclusions face Daubert. We stay on the animation side and claim no admissibility.
- *Can an AI interviewer contaminate memory?* Yes; a 2024 MIT study found an LLM interviewer induced three times the false memories of a control. So the agent asks only open questions, never supplies a detail, names the room, and copilot mode, where a human asks, is the mode real investigators would use.
- *What happens when the investigator disagrees with the room?* They override with a written reason and a confirmation; the badge stays, and History shows the original finding, the decision and who made it.
- *What is new?* VeriScene (Sept 2026) makes an 8-second video from photos and statements offline; Criminator (CHI 2026) lets officers hand-animate in a scan. Nobody closes the loop live with a gate and an editable multi-witness scene.

## Guardrails slide (read verbatim if tired)

Human in the loop on every accept, override and export. Provenance on every element. Uncertainty drawn as uncertainty. No guilt, intent, credibility or deception outputs. Every export labeled "AI-assisted illustration, not a recording." Demo on synthetic data with generic faceless figures.
