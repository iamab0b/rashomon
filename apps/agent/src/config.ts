import type { SceneManifest } from "@rashomon/schema";
import { roomScene, storeScene } from "@rashomon/schema/fixtures";
import { INITIAL_MESSAGE, STORE_EXAMPLES, instructionsFor, type Examples } from "./instructions";

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
  sceneId?: string;
};

export const DEFAULT_SCENE_ID = "store_v1";

type Scene = { manifest: SceneManifest; examples: (label: (id: string) => string) => Examples };

const SCENES: Readonly<Record<string, Scene>> = {
  store_v1: { manifest: storeScene, examples: () => STORE_EXAMPLES },
  room_v1: {
    manifest: roomScene,
    examples: (label) => ({
      anchor: `Were you closer to the ${label("ladder")} or the ${label("window_s")}?`,
      time: `Was that before or after he reached the ${label("window_s")}?`,
    }),
  },
};

export const SCENE_IDS = Object.keys(SCENES);

export function sceneFor(sceneId: string = DEFAULT_SCENE_ID): Scene {
  const scene = Object.hasOwn(SCENES, sceneId) ? SCENES[sceneId] : undefined;
  if (!scene) throw new Error(`RASHOMON_SCENE_ID ${sceneId} is not a known scene; known scenes: ${SCENE_IDS.join(", ")}`);
  return scene;
}

export function instructions(sceneId: string = DEFAULT_SCENE_ID): string {
  const { manifest, examples } = sceneFor(sceneId);
  const label = (id: string): string => {
    const landmark = manifest.landmarks.find((l) => l.id === id);
    if (!landmark) throw new Error(`scene ${manifest.sceneId} has no landmark ${id}`);
    return landmark.label;
  };
  return instructionsFor(examples(label));
}

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

export function keyterms(sceneId: string = DEFAULT_SCENE_ID): string[] {
  return [...new Set(sceneFor(sceneId).manifest.landmarks.map((l) => l.label))];
}

export function agentConfig(s: Settings, toolIds: string[]) {
  return {
    instructions: instructions(s.sceneId),
    initial_message: INITIAL_MESSAGE,
    model: { id: s.modelId },
    tools: toolIds.map((id) => ({ id })),
    system_tools: { end_call: {} },
    audio: {
      input: { keyterms: keyterms(s.sceneId) },
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
