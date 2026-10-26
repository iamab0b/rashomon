# Two-minute demo video

Recorded Saturday 9 to 11 PM on Sahil's laptop, two takes, target 2:00 (hard stop 2:30). Devpost needs a locally stored file; Cartesia wants demo-first, so the catch opens the video. Based on the prep pack's plan, checked against main on Sat afternoon. Lines marked **(if merged)** depend on Eric's agent (branch cartesia-agent) being on main by the recording.

## Setup

- Chrome, 1280 × 720 window, dark theme, `localhost:5173`. Record from the `demo-v1` tag, which is made at the 9 PM freeze (it does not exist before then).
- Screen capture at 30 fps (OBS or the OS recorder), plus a phone recording room audio as backup. Headset mic for the witness voice.
- Hazel is the witness voice and narrator, Sahil drives. **(if merged)** Eric runs the agent; otherwise Hazel reads the question from the Flags card.
- Before/after frames from Sahil: **02 = the catch** (title card), **05 = after correction** (stack card). Save them as `demo/frames/02-catch.png` and `demo/frames/05-after-correction.png`.
- If recording live, use a scratch session, never `demo`, and open the tab before starting; it takes about 7 s to load.
- Keep the better take; store it on two laptops and a phone. Upload nothing yet.

## Shot list

| # | Time | Length | On screen | URL or action | Narration / audio |
|---|---|---|---|---|---|
| 1 | 0:00 | 5 s | t = 11: witness ghost, red badge, red ray at the chips shelf | `/?t=11` | Witness line (utt_6, utt_7): "That's when I looked up." "I saw his face clearly." "Watch the sightline." |
| 2 | 0:05 | 10 s | **The catch moment: the drag.** Sahil drags e5's gizmo from the chips aisle to the front window; the ghost and badge go, the ray turns green, and a soft contradiction flag appears: "Earlier you said you were by the chips aisle around then; now the front window. Which came first?" | select e5, drag the gizmo to the front window (not `?scenario=corrected`) | "The room asks a question, it doesn't rule." Hold on the question; it is the line judges remember. |
| 3 | 0:15 | **20 s** | **Voice slot.** The question from the sightline flag, and the witness answering "by the window" | **(if merged)** live voice, or the recorded clean session. **Fallback:** the Flags card on screen, Hazel reads the question | Question and witness audio only. Say "the room asks", never "live voice", unless the agent is merged. |
| 4 | 0:35 | 5 s | Title card with frame 02 (the catch) | still | "Rashomon." One line on what it does. |
| 5 | 0:40 | 15 s | Overview of the store, landmarks labeled | `/` | The problem sentence with the quote. A modeled store from a measured floor plan. |
| 6 | 0:55 | 20 s | Play from 0: the suspect walks door → counter; Events tab cards, each linking to its source sentence in the Transcript | Play, Events tab | "Every event came from a sentence she said." |
| 7 | 1:15 | 20 s | Override on e5 with a reason → "Apply this override?" → Confirm override; the amber Overridden mark on the timeline block and in the panel; History drawer: Original finding → Override → Current state | back on `/` | "Accepting what the room rules out takes a written reason, and the record keeps it." |
| 8 | 1:35 | 5 s | The real-size placeholder for the knife, in the suspect's hand | scrub to after the pick-up | "Objects appear as real-size placeholders." |
| 9 | 1:40 | 5 s | Guardrails card | still | "A demonstrative aid, not a verdict." |
| 10 | 1:45 | 5 s | Stack card with frame 05 (after correction) | still | One line: Claude, SpacetimeDB, Three.js, and Cartesia (**if merged** "runs the interview"; otherwise "is next"). |

Total 1:50. Cut shot 8 if over.

## If voice is not stable at 9 PM

**(if merged)** Record shot 3 in text mode and overlay audio from a clean voice session recorded earlier (Eric's task 04). Until the Statement box (PR #35) merges there is no text mode: the catch is the drag (and `?scenario=corrected` for the after frame), and the question is read from the Flags card. The 20-second slot stays the same length either way. Say "the room asks" and never "live voice".

## If the fixture misbehaves

Record from the live URL on a scratch session. Sahil seeds it with `tools/smoke/seed-maincloud.sh take1` (see docs/demo-laptop.md); open `/?mode=live&stdb=wss://maincloud.spacetimedb.com&db=rashomon&session=take1`, and use take2 for the next take. Open the tab before recording starts (about 7 s to load). Never drag or override in session `demo`; it is the shared starting state.

## Afterward

Pre-fill the Devpost form from the prep pack's devpost-draft.md, attach the video and the project image, and do not press submit until Sunday 8:30 AM with everyone at the table.
