# Pitch script: 3 minutes, plus the 2-minute demo-first cut

Hazel presents, Sahil drives, A takes technical questions, Eric stands by on voice. About 420 words for the 3-minute version. Based on the prep pack's script, checked against main on Sat afternoon. The two quotes are from our interview with a person who has given a formal police statement (notes in demo/witness-interview.md). They agreed to be quoted before the interview; we credit them by role. Lines in *italics* are what is on screen; quoted UI text is exactly what the app shows. Lines marked **(if merged)** depend on Eric's agent (branch cartesia-agent) or the Statement box (PR #35) being on main by the recording; use the fallback next to them until then.

Demo URLs (Sahil's laptop, `localhost:5173`):
- Fixture, the default: `/`
- The catch, ready to show: `/?t=11`
- The corrected statement, the after frame: `/?scenario=corrected&t=11`
- Live fallback, no local server needed: `/?mode=live&stdb=wss://maincloud.spacetimedb.com&db=rashomon&session=demo`. If we demo live, open this tab before the pitch starts (about 7 s to load). Look only; never drag or override in session `demo`.

## 3-minute version

**0:00 · The problem (20 s)**
"Someone who has given a police statement told us: “The hardest part was organizing everything in chronological order, or separating things out and explaining them clearly, while also knowing whether what I said had been recorded accurately.” Eyewitness testimony is the most common evidence there is and the least checkable. A witness talks, it becomes a paragraph, and nobody checks that paragraph against the room until trial, if ever."

**0:20 · What we built (20 s)** *Overview of the store, landmarks labeled.*
"Rashomon turns testimony into events placed in a modeled store, built from a measured floor plan. Every event links to the sentence it came from. And the room decides what is possible: a sightline, a path or a timing the geometry rules out is never animated as fact."

**0:40 · The loop (30 s)** *Sahil plays from t = 0; Hazel narrates only what is on screen.*
"A customer in the chips aisle. The suspect comes in the front door and walks to the counter; the clerk is behind it." *Events tab: each card shows time, person, action and place, and links to its source sentence in the Transcript.* "Every one of these came from a sentence she said."

**1:10 · The catch (40 s)** *Playhead to 11 s. The witness turns into a wireframe ghost with a red badge; the red ray stops at the chips shelf.*
Witness (utt_6, utt_7 in the Transcript): "That's when I looked up." "I saw his face clearly."
"Watch the sightline." *Flags tab:* "Under the current scene geometry, the sightline is blocked by the chips shelf."
**[20-second voice slot]** **(if merged)** Eric's agent asks the flag's question aloud. **Fallback:** Hazel reads it from the Flags card: "The room asks: From the chips aisle, the chips shelf would be between you and the suspect. Where exactly were you standing when you saw that?" Witness: "Oh. I'd stepped out to the front, by the window."
*Correction, done as a drag (this is the catch moment): Sahil drags e5's gizmo to the front window. The ghost and badge go and the ray turns green. A soft contradiction flag appears; pause on it:* "Earlier you said you were by the chips aisle around then; now the front window. Which came first?"
"The event moves. The ray is clear. And the room asks a question, it doesn't rule: nothing was faked and nobody was judged."

**1:50 · Investigator control (25 s)** *Back on `/`. Override on e5, type a reason, "Apply this override?", Confirm override; the amber Overridden mark stays on the timeline block and in the panel. Open History.*
"The investigator stays in charge. Accepting something the room rules out takes a written reason and a second confirmation, and the amber Overridden mark stays. History keeps the whole story: the original finding, who overrode it and why, and where it stands now. Every change is a patch with a source."

**2:15 · Props and witnesses (15 s)** *The real-size placeholder for the knife, in the suspect's hand.*
"Objects the witness names appear as real-size placeholders, in the hand that holds them. A second witness becomes a second layer, and where two statements differ you get a flag, not a verdict."

**2:30 · Who it is for and what it is not (20 s)** *Guardrails card.*
"Their biggest worry: “If something I said wasn't actually a fact but was recorded as if it were, it could create confusion and have a negative impact.” This is a demonstrative aid that tests hypotheses, not a simulation that reaches conclusions. A human decides every accept and override. Every element has a source. Uncertainty is drawn as uncertainty. There is no credibility score anywhere. Exports will carry the label: AI-assisted illustration, not a recording."

**2:50 · Stack (10 s)** *Stack card.*
"Claude Sonnet turns speech into events. SpacetimeDB holds one shared world, and the room's verdict commits in the same transaction as the claim. Three.js on a measured floor plan." **(if merged)** "A Cartesia agent runs the interview." **Fallback:** "The Cartesia agent is next; its webhook is live, checks a shared secret, runs Claude extraction and returns the flags to the agent."

## 2-minute demo-first cut (every sponsor judge)

1. **The catch, first (0:00–0:15):** open on `/?t=11`. Witness line, "Watch the sightline", the ray stops at the chips shelf; Sahil drags e5 to the front window, the ray turns green and the question appears. No introduction before it.
2. **The question (0:15–0:35):** the 20-second slot. **(if merged)** the agent asks aloud. **Fallback:** read the question from the Flags card and say plainly that voice is next. If the agent is not live by recording, decide with Sahil whether this beat shows the webhook instead (a curl returning 401 without the secret).
3. **What you just saw (0:35–0:55):** a modeled store from a measured floor plan, a gate that checks sightlines, paths and timing, and a source on every event.
4. **How it's built (0:55–1:20):** the stack paragraph with the sponsor's piece first. Cartesia: **(if merged)** Ink in, Sonic out, the webhook returns the flags mid-turn; **fallback:** the webhook is live and returns the flags, the agent is next. SpacetimeDB: the gate commits in the same transaction as the claim. Anthropic: strict-tool extraction, and where it could go wrong. Microsoft: production path, override log, responsible design.
5. **Who it is for (1:20–1:40):** with the worry quote (a guess recorded as fact).
6. Stop and take questions.

## If something breaks on stage

- Fixture looks wrong: switch to the live URL above, just to look. Maincloud's demo session starts at the same state (e5 implausible). Never drag or override in session `demo`; for a live drag, use a scratch session Sahil seeds with `tools/smoke/seed-maincloud.sh take1` (see docs/demo-laptop.md), and open the same URL with `session=take1`.
- Voice is not up: until the Statement box merges, the catch is the drag (and `?scenario=corrected` for the after frame), and Hazel reads the question from the Flags card. Say "the room asks", never "live voice".
- e5 will not select at 11 s: press "Next flag", which selects it and moves the playhead.

## Judge questions, one-line answers

- *Isn't this a lie detector?* No. It checks claims against geometry and against each other, never people; honest witnesses misjudge distance and time constantly. There is no credibility score in the product.
- *Why not just generate a video?* A generated video is a persuasive fiction with invented distances. Ours can be wrong in a checkable way, and it refuses to draw what the room rules out.
- *Would a court allow it?* California's Duenas decision admits demonstrative animations that fairly represent the evidence; simulations that reach conclusions face Daubert. We stay on the animation side and claim no admissibility.
- *Can an AI interviewer contaminate memory?* Yes; a 2024 MIT study found an LLM interviewer induced three times the false memories of a control. So the agent will ask only open questions, never supply a detail, and name the room, and copilot mode, where a human asks, is the mode real investigators would use.
- *What happens when the investigator disagrees with the room?* They override with a written reason and a confirmation; the Overridden mark stays, and History shows the original finding, the decision and who made it.
- *What is new?* VeriScene (arXiv, Sept 2026) makes an 8-second video from photos and statements offline; Criminator (CHI 2026) lets officers hand-animate in a scan. Nobody closes the loop live with a gate and an editable multi-witness scene.

## Guardrails slide (read verbatim if tired)

Human in the loop on every accept, override and export. Provenance on every element. Uncertainty drawn as uncertainty. No guilt, intent, credibility or deception outputs. Exports will be labeled "AI-assisted illustration, not a recording." Demo on synthetic data with generic faceless figures.
