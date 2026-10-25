import { storeScene } from "@rashomon/schema/fixtures";
import { INITIAL_MESSAGE, INSTRUCTIONS } from "./instructions";

export const SECRET_HEADER = "X-Rashomon-Webhook-Secret";
export const TOOL_NAMES = ["record_statement", "get_scene_context", "end_interview"] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

export type Settings = {
  tunnelUrl: string;
  database: string;
  sessionId: string;
  witnessId: string;
  webhookSecret: string;
  modelId: string;
  voiceId: string | undefined;
};

type Secret = { type: "secret"; secret_value: string; secret_description: string };
type BodyParam =
  | { type: "string"; description: string }
  | { type: "string"; constant_value: string };

export type WebhookTool = {
  type: "webhook";
  name: ToolName;
  description: string;
  pre_tool_speech: "auto" | "force" | "off";
  execution_mode: "immediate" | "async";
  response_timeout_secs: number;
  api_schema: {
    url: string;
    method: "POST";
    request_headers: Record<string, Secret>;
    request_body_schema: { type: "object"; properties: Record<string, BodyParam>; required: string[] };
  };
};

const ROUTES: Record<ToolName, string> = {
  record_statement: "record_statement",
  get_scene_context: "scene_context",
  end_interview: "end_interview",
};

export function webhookUrl(s: Pick<Settings, "tunnelUrl" | "database">, tool: ToolName): string {
  const base = new URL(s.tunnelUrl);
  if (base.protocol !== "https:") throw new Error("RASHOMON_TUNNEL_URL must be an https URL");
  const path = `/v1/database/${encodeURIComponent(s.database)}/route/webhook/cartesia/${ROUTES[tool]}`;
  return new URL(path, base.origin).toString();
}

const constant = (value: string): BodyParam => ({ type: "string", constant_value: value });

export function toolDefinition(s: Settings, name: ToolName): WebhookTool {
  const properties: Record<string, BodyParam> = { session_id: constant(s.sessionId) };
  const required: string[] = [];
  let description: string;
  let preToolSpeech: WebhookTool["pre_tool_speech"] = "off";
  let timeout = 10;
  if (name === "record_statement") {
    properties.witness_id = constant(s.witnessId);
    properties.text = { type: "string", description: "The witness's words from their last turn, verbatim, not a summary." };
    required.push("text");
    description =
      "Record what the witness just said. Call it after every witness turn with their exact words, including answers to follow-ups. If the result's askNext is not null, ask askNext.question on your next turn.";
    preToolSpeech = "auto";
    timeout = 120;
  } else if (name === "get_scene_context") {
    description =
      "Get the scene's landmark names and the last five recorded events, for context. Its nextQuestion is context only: do not ask it. Follow-up questions come only from record_statement's askNext.";
  } else {
    description = "Close the interview record. Call it once, when the witness says they are finished, before ending the call.";
  }
  return {
    type: "webhook",
    name,
    description,
    pre_tool_speech: preToolSpeech,
    execution_mode: "immediate",
    response_timeout_secs: timeout,
    api_schema: {
      url: webhookUrl(s, name),
      method: "POST",
      request_headers: {
        [SECRET_HEADER]: { type: "secret", secret_value: s.webhookSecret, secret_description: "Rashomon webhook secret" },
      },
      request_body_schema: { type: "object", properties, required },
    },
  };
}

export function keyterms(): string[] {
  return [...new Set(storeScene.landmarks.map((l) => l.label))];
}

export function agentConfig(s: Settings, toolIds: string[]) {
  return {
    instructions: INSTRUCTIONS,
    initial_message: INITIAL_MESSAGE,
    model: { id: s.modelId },
    tools: toolIds.map((id) => ({ id })),
    system_tools: { end_call: {} },
    audio: {
      input: { keyterms: keyterms() },
      ...(s.voiceId ? { output: { voice_id: s.voiceId } } : {}),
    },
  };
}

export function agentBody(s: Settings, toolIds: string[]) {
  return {
    name: "Rashomon interviewer",
    description: "Neutral witness interviewer for Rashomon; records statements through the SpacetimeDB webhook.",
    config: agentConfig(s, toolIds),
  };
}
