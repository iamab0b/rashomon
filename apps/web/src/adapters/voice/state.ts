export type VoiceStatus = "idle" | "connecting" | "listening" | "speaking" | "error";

export type VoiceState = { status: VoiceStatus; error: string | null };

export type VoiceAction =
  | { type: "start" }
  | { type: "ready" }
  | { type: "agentAudio" }
  | { type: "drained" }
  | { type: "interrupted" }
  | { type: "fail"; error: string }
  | { type: "stop" };

export const IDLE: VoiceState = { status: "idle", error: null };

export function voiceReducer(state: VoiceState, action: VoiceAction): VoiceState {
  switch (action.type) {
    case "start":
      return state.status === "idle" || state.status === "error" ? { status: "connecting", error: null } : state;
    case "ready":
      return state.status === "connecting" ? { status: "listening", error: null } : state;
    case "agentAudio":
      return state.status === "listening" ? { status: "speaking", error: null } : state;
    case "drained":
    case "interrupted":
      return state.status === "speaking" ? { status: "listening", error: null } : state;
    case "fail":
      return state.status === "idle" ? state : { status: "error", error: action.error };
    case "stop":
      return IDLE;
  }
}

export const isActive = (status: VoiceStatus): boolean => status === "connecting" || status === "listening" || status === "speaking";
