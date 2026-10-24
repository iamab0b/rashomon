import { ACTIONS } from "@rashomon/schema";
import type { ToolDef } from "./types";

export const STRICT_TOOLS = true;

export const CONFIDENCE_MAP = { low: 0.3, medium: 0.6, high: 0.9 } as const;

const nullable = (schema: Record<string, unknown>) => ({
  anyOf: [schema, { type: "null" }],
});

const anchorObject = {
  type: "object",
  properties: {
    kind: { type: "string", enum: ["at", "near", "behind", "between"] },
    landmark: {
      type: "string",
      description:
        "Landmark id from the list. For kind between, the first landmark.",
    },
    second_landmark: nullable({
      type: "string",
      description: "Only for kind between: the second landmark id. Else null.",
    }),
    radius_m: nullable({
      type: "number",
      description:
        "Only for kind near: radius in meters if the witness gave one. Else null.",
    }),
  },
  required: ["kind", "landmark", "second_landmark", "radius_m"],
  additionalProperties: false,
};

const anchor = (description: string) => ({
  anyOf: [anchorObject, { type: "null" }],
  description,
});

const sources = {
  type: "array",
  items: { type: "string" },
  description:
    "Utterance ids that support this. Must include the id of the statement being processed.",
};

const confidence = {
  type: "string",
  enum: ["low", "medium", "high"],
  description:
    "How clearly the witness said it. Hedges like 'I think' or 'maybe' mean low or medium.",
};

const tConfidence = {
  type: "string",
  enum: ["stated", "inferred"],
  description:
    "stated if the witness gave the timing, inferred if you estimated it from order.",
};

const eventProps = {
  actor: { type: "string", description: "Actor id from the actor list." },
  action: { type: "string", enum: [...ACTIONS] },
  from: anchor("Where the movement starts, or null."),
  to: anchor("Where the movement ends, or null."),
  at: anchor("Where a stationary action happens, or null."),
  facing: nullable({
    type: "string",
    description: "Landmark id the actor is facing, or null.",
  }),
  target: nullable({
    type: "string",
    description: "Actor id the action is directed at, or null.",
  }),
  prop: nullable({
    type: "string",
    description:
      "Prop id, or a prop type from the library if the prop was just added, or null.",
  }),
  t_start: { type: "number", description: "Seconds from incident start." },
  t_end: { type: "number", description: "Seconds from incident start." },
  t_confidence: tConfidence,
  confidence,
  sources,
};

const changeProps = {
  action: nullable({ type: "string", enum: [...ACTIONS] }),
  from: anchor("New start anchor, or null for no change."),
  to: anchor("New end anchor, or null for no change."),
  at: anchor("New anchor, or null for no change."),
  facing: nullable({ type: "string" }),
  target: nullable({ type: "string" }),
  prop: nullable({ type: "string" }),
  t_start: nullable({ type: "number" }),
  t_end: nullable({ type: "number" }),
};

const tool = (
  name: string,
  description: string,
  properties: Record<string, unknown>,
): ToolDef => ({
  name,
  description,
  strict: STRICT_TOOLS,
  input_schema: {
    type: "object",
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  },
});

export const EXTRACTOR_TOOLS: ToolDef[] = [
  tool(
    "add_event",
    "Record one thing that happened, as the witness described it. One call per event.",
    eventProps,
  ),
  tool(
    "update_event",
    "Change an existing event because the witness corrected or refined it. Use null for fields that stay the same.",
    {
      id: { type: "string", description: "Existing event id." },
      ...changeProps,
      sources,
    },
  ),
  tool("retract_event", "Remove an event the witness took back.", {
    id: { type: "string", description: "Existing event id." },
    sources,
  }),
  tool(
    "add_prop",
    "Record an object the witness mentioned. Match it to a library type.",
    {
      type: { type: "string", description: "Prop type id from the library." },
      anchor: anchor("Where the prop is, or null."),
      held_by: nullable({
        type: "string",
        description: "Actor id holding it, or null.",
      }),
      notes: {
        type: "string",
        description:
          "The witness's own description in their words, e.g. 'maybe eight inches'. Empty string if none.",
      },
      sources,
    },
  ),
  tool("update_prop", "Change an existing prop's anchor, holder or notes.", {
    id: { type: "string", description: "Existing prop id." },
    anchor: anchor("New anchor, or null."),
    held_by: nullable({ type: "string" }),
    notes: nullable({ type: "string" }),
    sources,
  }),
  tool(
    "add_actor",
    "Add a person the witness mentions who is not in the actor list.",
    {
      id: {
        type: "string",
        description: "Short lowercase id, e.g. second_customer.",
      },
      label: { type: "string" },
      role: { type: "string", enum: ["witness", "suspect", "victim", "other"] },
    },
  ),
  tool(
    "no_events",
    "Call this when the statement contains nothing to add to the reconstruction.",
    { reason: { type: "string" } },
  ),
];
