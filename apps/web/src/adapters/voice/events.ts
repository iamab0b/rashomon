import { bytesToBase64, INPUT_FORMAT } from "./audio";

export const CARTESIA_VERSION = "2026-08-14";

export function agentSocketUrl(agentId: string, accessToken: string): string {
  const params = new URLSearchParams({ cartesia_version: CARTESIA_VERSION, access_token: accessToken });
  return `wss://api.cartesia.ai/v1/agents/websocket/${encodeURIComponent(agentId)}?${params}`;
}

export const RELAY_BASE = "ws://127.0.0.1:8787";

// The local token server holds the API key and relays the socket, so the URL carries no credential.
export function relaySocketUrl(agentId: string, base = RELAY_BASE): string {
  const params = new URLSearchParams({ cartesia_version: CARTESIA_VERSION });
  return `${base}/agent/${encodeURIComponent(agentId)}?${params}`;
}

export type ServerEvent =
  | { type: "session_ready"; call_id: string }
  | { type: "audio_output"; audio: string }
  | { type: "audio_output_clear" }
  | { type: "turn_started"; turn: number; role: "user" | "assistant" }
  | { type: "error"; code: string; message: string; fatal: boolean };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export function parseServerEvent(raw: unknown): ServerEvent | null {
  if (typeof raw !== "string") return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(data)) return null;
  switch (data.type) {
    case "session_ready":
      return typeof data.call_id === "string" ? { type: "session_ready", call_id: data.call_id } : null;
    case "audio_output":
      return typeof data.audio === "string" ? { type: "audio_output", audio: data.audio } : null;
    case "audio_output_clear":
      return { type: "audio_output_clear" };
    case "turn_started":
      return typeof data.turn === "number" && (data.role === "user" || data.role === "assistant")
        ? { type: "turn_started", turn: data.turn, role: data.role }
        : null;
    case "error":
      return {
        type: "error",
        code: typeof data.code === "string" ? data.code : "unknown",
        message: typeof data.message === "string" ? data.message : "Voice agent error",
        fatal: data.fatal === true,
      };
    default:
      return null;
  }
}

export function sessionCreate(): string {
  return JSON.stringify({
    type: "session_create",
    audio: { input_format: INPUT_FORMAT, output_delivery: "speaking_pace", continuous_input: true },
  });
}

export function audioInput(pcm: Uint8Array): string {
  return JSON.stringify({ type: "audio_input", audio: bytesToBase64(pcm) });
}
