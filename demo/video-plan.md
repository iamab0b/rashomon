# Two-minute demo video

Recorded Saturday 9 to 11 PM on Sahil's laptop, two takes, target 2:00 (hard stop 2:30). Devpost needs a locally stored file; Cartesia wants demo-first. Based on the prep pack's plan, updated Sat 1 PM to what main does now.

## Setup

- Chrome, the `demo-v1` tag, 1280 × 720 window, dark theme, `localhost:5173`.
- Screen capture at 30 fps (OBS or the OS recorder), plus a phone recording room audio as backup. Headset mic for the witness voice.
- Hazel is the witness voice and narrator, Sahil drives, Eric runs the agent.
- Before/after frames from Sahil: **02 = the catch** (title card), **05 = after correction** (stack card). Save them as `demo/frames/02-catch.png` and `demo/frames/05-after-correction.png`.
- If recording live, open the live tab before starting; it takes about 7 s to load.
- Keep the better take; store it on two laptops and a phone. Upload nothing yet.

## Shot list

| # | Time | Length | On screen | URL or action | Narration / audio |
|---|---|---|---|---|---|
| 1 | 0:00 | 5 s | Title card with frame 02 (the catch) | still | "Rashomon." One line on what it does. |
| 2 | 0:05 | 15 s | Overview of the store, landmarks labeled | `/` | The problem sentence with the quote. |
| 3 | 0:20 | 20 s | Play from 0: the suspect walks door → counter; Events tab cards with sources | Play, Events tab | "Every event came from a sentence she said." |
| 4 | 0:40 | 15 s | t = 11: witness ghost, red badge, red ray at the chips shelf; Flags card | `/?t=11` or "Next flag" | Witness line: "I saw his face… from the chips aisle." "Watch the sightline." |
| 5 | 0:55 | **20 s** | **Voice slot (Eric's path).** The agent asks the flag's question; the witness answers "by the window" | live voice, or the recorded clean session | Agent and witness audio only. |
| 6 | 1:15 | 15 s | **The catch moment: the drag.** Sahil drags e5's gizmo from the chips aisle to the front window; the ghost and badge go, the ray turns green, and the gate's follow-up question appears right after. POV from the window shows the clerk and the suspect | select e5, drag the gizmo to the front window (not `?scenario=corrected`) | "The room asked the question. Nothing was faked." Hold on the question; it is the line judges remember. |
| 7 | 1:30 | 20 s | Override on e5 with a reason → "Apply this override?" → Confirm override; amber badge; History drawer: original finding → override → current state | back on `/` | "Accepting what the room rules out takes a written reason, and the record keeps it." |
| 8 | 1:50 | 5 s | The knife in the suspect's hand | scrub to after the pick-up | "Objects appear at real size." |
| 9 | 1:55 | 5 s | Guardrails card | still | "A demonstrative aid, not a verdict." |
| 10 | 2:00 | 5 s | Stack card with frame 05 (after correction) | still | One line: Claude, Cartesia, SpacetimeDB, Three.js. |

Total 2:05. Cut shot 8 if over.

## If voice is not stable at 9 PM

Record shots 4–6 in text mode and overlay audio from a clean voice session recorded earlier (Eric's task 04). The 20-second slot stays the same length either way. Say "the agent asks" and never "live voice".

## If the fixture misbehaves

Record from the live URL: `/?mode=live&stdb=wss://maincloud.spacetimedb.com&db=rashomon&session=demo`. Open that tab before recording starts (about 7 s to load). Its demo session starts at the same state (e5 implausible). Do not override or drag in session `demo`; use a scratch session, because demo is the shared starting state.

## Afterward

Pre-fill the Devpost form from the prep pack's devpost-draft.md, attach the video and the project image, and do not press submit until Sunday 8:30 AM with everyone at the table.
