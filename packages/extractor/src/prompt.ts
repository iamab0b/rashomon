import type { Anchor, Event, Segment, Witness } from "@rashomon/schema";
import { EXTRACTOR_TOOLS } from "./tools";
import type { ExtractContext, ModelMessage, ModelRequest } from "./types";

export const EXTRACTION_MODEL = "claude-sonnet-5-5";
export const NO_TOOL_CALL_NUDGE = "Reply only with tool calls. If nothing belongs in the reconstruction, call no_events.";
export const NO_TOOL_CALL = "the model returned no tool call";
export const TRUNCATED = "truncated";

export const SYSTEM_PROMPT = `You turn one witness statement at a time into structured changes to an event graph that will be drawn as a 3D reconstruction of a real room. You never reply in prose. You reply only by calling tools.

Rules, in priority order:

1. Record only what the witness actually said. Never add a detail they did not say. Never guess a motive, a name, a face, clothing or anything you would have to imagine. If something is unclear, record less, not more.
2. Never output coordinates or numbers for positions. Place everything by landmark id from the landmark list. Match the witness's words to landmarks through the labels and aliases, so "the snack aisle on the left" is the landmark whose aliases include it, not a new place. If the witness gives no location for something, leave the anchor null.
3. Use actor ids from the actor list. SPEAKING WITNESS says who is talking: I, me, my and myself are that witness's actor, never another witness's actor. If that witness has no actor yet, do what SPEAKING WITNESS says. If a new person is mentioned, call add_actor first.
4. Time is seconds from the start of the incident, as the witness narrates it. The first thing described happens at 0. Keep times consistent with the existing events listed below. Give an interval, never a point: if the witness says "about ten seconds", use a range around it. If they gave no timing, estimate from the order of events and ordinary durations, and set t_confidence to inferred. If they gave a timing, set it to stated.
5. A statement about the length of the whole incident ("twenty, thirty seconds") is not an event. Do not add it. Use it only to keep your own estimates in proportion.
6. Appearance (age, build, clothing, hair) is not an event. Do not add events or props for it. When the witness describes a person's build or height, choose the nearest body and estimate heightM. Map clothing colour words to tint. Only use what the witness said; leave a field out when it was not described. These go on add_actor when you add the person. If a statement contains only appearance of people already in the actor list, call no_events.
7. Confidence is how clearly the witness said it: high for plain statements, medium for hedged ones ("I think", "kind of"), low for guesses or reconstructions.
8. If the witness corrects or refines something already in the graph, call update_event or update_prop on the existing id. Do not add a duplicate. If they say they were somewhere else, change that event, and add or adjust the movement events around it only if the witness described that movement. If they take something back, call retract_event. When the witness corrects where they were, apply the new place to their later events that were placed at the old place, until they describe moving again. Use update_event on each of those events.
9. For "behind the counter" style phrases use kind behind when the witness means the far side of a landmark, and kind at when a landmark zone already has that name.
10. Objects: match the witness's word to a type in the prop library using its label and aliases. Put their own size or description words in notes, in their words ("maybe eight inches"); never change dimensions. A prop needs an anchor: use the landmark closest to where the prop is, even when someone holds it, and set held_by to the holder.
11. An event that uses a prop you add in the same turn refers to it by its prop type.
12. sources must include the statement id given to you. You may also cite earlier statement ids if the new statement depends on them.
13. If the witness's verb is not one of the actions, choose the nearest action, set actionApproximated to true and put the witness's verb in verb. Never invent a verb the witness did not use.
14. Set style only when the witness described how the action was done: sneak for walk, scared for run, forward for fall, outward for open_door, behind for look. Otherwise leave it null. If the witness takes a style back, call update_event with style none.
15. If nothing in the statement belongs in the reconstruction, call no_events with a short reason.

Call one tool per change. Call as many as the statement needs. Every reply must contain at least one tool call: when nothing belongs in the reconstruction, call no_events. Never answer in prose.`;

const anchorText = (a: Anchor | undefined): string => {
  if (!a) return "-";
  if (a.kind === "at") return a.landmark;
  if (a.kind === "near") return `near(${a.landmark})`;
  if (a.kind === "behind") return `behind(${a.landmark})`;
  if (a.kind === "between") return `between(${a.a},${a.b})`;
  return "xyz";
};

const eventLine = (e: Event): string => {
  const parts = [e.id, e.actor, e.action];
  if (e.from) parts.push(`from=${anchorText(e.from)}`);
  if (e.to) parts.push(`to=${anchorText(e.to)}`);
  if (e.at) parts.push(`at=${anchorText(e.at)}`);
  if (e.facing) parts.push(`facing=${e.facing}`);
  if (e.target) parts.push(`target=${e.target}`);
  if (e.prop) parts.push(`prop=${e.prop}`);
  if (e.style) parts.push(`style=${e.style}`);
  if (e.actionApproximated) parts.push(e.verb ? `approximated_from=${e.verb}` : "approximated");
  parts.push(`t=[${e.t[0]},${e.t[1]}]`);
  if (e.status === "superseded") parts.push("(superseded)");
  return parts.join(" ");
};

export function buildContextText(ctx: ExtractContext): string {
  const landmarks = ctx.landmarks
    .map((l) => `- ${l.id}: ${l.label} (also called: ${l.aliases.join("; ")})`)
    .join("\n");
  const actors = ctx.actors
    .map((a) => `- ${a.id}: ${a.label} (${a.role})`)
    .join("\n");
  const props = ctx.propTypes
    .map((p) => `- ${p.type}: ${p.label} (also called: ${p.aliases.join("; ")})`)
    .join("\n");
  const events = ctx.events.length
    ? ctx.events.map(eventLine).join("\n")
    : "(none yet)";
  const existingProps = ctx.props.length
    ? ctx.props
        .map(
          (p) =>
            `${p.id} ${p.type} at=${anchorText(p.anchor)}${p.heldBy ? ` held_by=${p.heldBy}` : ""}`,
        )
        .join("\n")
    : "(none yet)";
  return `LANDMARKS\n${landmarks}\n\nACTORS\n${actors}\n\nPROP LIBRARY\n${props}\n\nEXISTING EVENTS\n${events}\n\nEXISTING PROPS\n${existingProps}`;
}

export function speakerOf(segment: Segment, ctx: ExtractContext): Witness {
  return ctx.witnesses?.find((w) => w.id === segment.witnessId) ?? { id: segment.witnessId, label: segment.witnessId };
}

export function speakerText(speaker: Witness): string {
  const name = speaker.label === speaker.id ? speaker.id : `${speaker.id} (${speaker.label})`;
  if (speaker.actorId !== undefined)
    return `The witness speaking is ${name}. In this statement, I, me, my and myself refer to actor ${speaker.actorId}.`;
  return `The witness speaking is ${name}. This witness has no actor yet. If the actor list already has an actor for ${speaker.label} by name, I, me, my and myself refer to that actor. Otherwise call add_actor first with role witness and label ${speaker.label}, and use that actor for I, me, my and myself.`;
}

export function buildUserMessage(
  segment: Segment,
  ctx: ExtractContext,
): ModelMessage {
  const earlier = ctx.recentSegments
    .filter((s) => s.id !== segment.id && s.speaker === "witness")
    .slice(-5)
    .map((s) => `${s.id}: ${s.text}`)
    .join("\n");
  const text = `${buildContextText(ctx)}\n\nSPEAKING WITNESS\n${speakerText(speakerOf(segment, ctx))}\n\nEARLIER WITNESS STATEMENTS\n${earlier || "(none)"}\n\nNEW STATEMENT ${segment.id}\n${segment.text}`;
  return { role: "user", content: [{ type: "text", text }] };
}

export function buildRequest(
  segment: Segment,
  ctx: ExtractContext,
  model: string = EXTRACTION_MODEL,
): ModelRequest {
  return {
    model,
    max_tokens: 16000,
    system: [
      {
        type: "text",
        text: SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    tools: EXTRACTOR_TOOLS,
    tool_choice: { type: "auto" },
    output_config: { effort: "low" },
    messages: [buildUserMessage(segment, ctx)],
  };
}
