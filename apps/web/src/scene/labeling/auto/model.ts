import type { CandidateSummary, LandmarkPayload } from "./payload";
import { proposeLandmarksTool, TOOL_NAME, validateProposals, type ToolDefinition, type ValidatedProposals } from "./tool";

export const LANDMARK_MODEL = "claude-sonnet-5-5";
export const LANDMARK_MAX_TOKENS = 4000;
export const NO_TOOL_CALL_NUDGE = `Reply only by calling ${TOOL_NAME}. Use label other for boxes you are unsure of.`;

export const SYSTEM_PROMPT = `You label candidate landmarks in a 3D scan of a room, for an investigator who rebuilds a witnessed incident. The scan's geometry was split into numbered boxes by code. You see one top-down view and two eye-height views, each with the same numbered outlines, and a list of every candidate id with its size in metres (width x height x depth).

Call ${TOOL_NAME} once with a proposal for each numbered box you can see.
- Name only what is visible inside the numbered boxes. Never invent a candidate id that is not in the list.
- Use label other when you are unsure what a box is.
- Use kind zone for floor areas a person stands in or walks through, and kind occluder for solid objects.
- Set occludes to true when the object would block a standing person's line of sight.
- Give a confidence from 0 to 1 and a short snake_case id of at most 24 characters.
- You never give positions or sizes; those come from the boxes.`;

export type ContentBlock = Record<string, unknown>;

export type LandmarkMessage = { role: "user" | "assistant"; content: string | ContentBlock[] };

export type LandmarkRequest = {
  model: string;
  max_tokens: number;
  system: ContentBlock[];
  tools: ToolDefinition[];
  tool_choice: { type: "auto" };
  output_config: { effort: "low" };
  messages: LandmarkMessage[];
};

export type LandmarkResponse = {
  content: ContentBlock[];
  stop_reason?: string;
};

export type CallLandmarkModel = (request: LandmarkRequest) => Promise<LandmarkResponse>;

export type ProposeResult = ({ readonly ok: true } & ValidatedProposals) | { readonly ok: false; readonly error: string };

export const NO_PROPOSALS = "the model returned no proposals";
export const TRUNCATED = "the model's reply was cut off";

function formatSize(n: number): string {
  return n.toFixed(2);
}

export function candidateText(candidates: readonly CandidateSummary[]): string {
  const lines = candidates.map(({ id, size }) => `${id}: ${formatSize(size[0])} x ${formatSize(size[1])} x ${formatSize(size[2])} m`);
  return `Candidates (width x height x depth):\n${lines.join("\n")}`;
}

export function buildLandmarkRequest(payload: LandmarkPayload, model: string = LANDMARK_MODEL): LandmarkRequest {
  const images = payload.images.map((data) => ({ type: "image", source: { type: "base64", media_type: "image/jpeg", data } }));
  return {
    model,
    max_tokens: LANDMARK_MAX_TOKENS,
    system: [{ type: "text", text: SYSTEM_PROMPT }],
    tools: [proposeLandmarksTool(payload.candidates.map((c) => c.id))],
    tool_choice: { type: "auto" },
    output_config: { effort: "low" },
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "Top-down view, then the two eye-height views from opposite corners." },
          ...images,
          { type: "text", text: candidateText(payload.candidates) },
        ],
      },
    ],
  };
}

function toolInput(response: LandmarkResponse): unknown {
  const block = response.content.find((b) => b.type === "tool_use" && b.name === TOOL_NAME);
  return block ? (block.input ?? null) : undefined;
}

export async function proposeLandmarks(payload: LandmarkPayload, callModel: CallLandmarkModel, maxRetries = 1): Promise<ProposeResult> {
  const request = buildLandmarkRequest(payload);
  const messages = [...request.messages];
  const ids = payload.candidates.map((c) => c.id);
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await callModel({ ...request, messages });
    if (response.stop_reason === "max_tokens") return { ok: false, error: TRUNCATED };
    const input = toolInput(response);
    if (input !== undefined) return { ok: true, ...validateProposals(input, ids) };
    if (response.content.length > 0) messages.push({ role: "assistant", content: response.content });
    messages.push({ role: "user", content: NO_TOOL_CALL_NUDGE });
  }
  return { ok: false, error: NO_PROPOSALS };
}
