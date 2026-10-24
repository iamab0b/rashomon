# Interview: a person who has given a police statement

Hazel, Saturday. The interviewee has given a formal statement in an investigative/police setting and spoke from the witness's side: recalling events, organizing details, and wondering how their words were recorded. No name or contact details are kept here.

**Quote permission is not confirmed.** Until it is, attribute by role only ("someone who has given a police statement") and never by name. If they decline, drop the quotes from the pitch.

## What was hardest

- Putting the event in chronological order.
- Keeping place, people and actions separate, and remembering which person did which action.
- Telling apart what they knew from what they were inferring.
- Not knowing whether the statement was recorded accurately.
- The pressure of the police station.
- Doubt afterward: something certain while speaking felt less certain later, especially because the event was traumatic.

## Quotes

> "The hardest part was organizing everything in chronological order, or separating things out and explaining them clearly, while also knowing whether what I said had been recorded accurately."

> "The hardest part was matching each person's actions to the right person. When a memory is traumatic, you can still be confused while you're talking—whether this person did something or that person did it."

> "I wanted the people listening to distinguish whether what I was saying was a fact or a guess."

> "I wanted them to clearly separate what I was saying with certainty from what was more like, 'I think this happened,' and ask me about those parts again."

> "Even if I was sure about something when I said it, I might become confused about it later."

> "If something I said wasn't actually a fact but was recorded as if it were, it could create confusion and have a negative impact."

> "Even after I left, I felt anxious—wondering whether I had explained everything correctly, or what would happen if I had said something wrong. I wanted that distinction to be clearly visible."

The pitch uses the first (the problem, 0:00) and the sixth (the worry, 2:30).

## What they wished for, against what main does

| They wished for | Rashomon on main |
|---|---|
| A chronological timeline of the statement | Yes: the timeline, with every event's time. |
| Which person did each action | Yes: every event has an actor, colored on the timeline and named on the card. |
| A visual, possibly 3D, reconstruction | Yes: the modeled store, with POV from the witness's position. |
| Review the record and correct it later | Partly: every card links to its source sentence, and a new statement can change events (Statement box, PR #35). Corrections are made by the investigator; there is no witness-facing review screen. |
| Fact, uncertain memory and guess kept apart | Not shown yet. The schema stores `tConfidence` ("stated" or "inferred") and a `confidence` per event, but the UI does not show either. The gate's flags mark what the room rules out, not what the witness was unsure of. |
| Key information at a glance, certainty vs speculation first | Not yet, for the same reason. |

## What it means for the pitch and the product

- **Pitch:** the worry quote is the strongest support for the guardrails beat: a guess recorded as fact is exactly what the gate and the source links are meant to stop. Do not claim the app separates fact from guess; it does not show that yet.
- **Product (Hazel, after the freeze or if there is time):** show stated vs inferred on the event card and the timeline, e.g. a dashed outline for inferred times. It is UI-only, because the data is already in the schema. Ask Sahil before starting.
- **Interviewing:** "ask me about those parts again" matches the agent's plan to ask each flag's question back, and supports copilot mode with open questions only.
