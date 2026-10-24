import type {
  Actor,
  Event,
  Landmark,
  Patch,
  PropInstance,
  PropType,
  Segment,
} from "@rashomon/schema";

export type ToolDef = {
  name: string;
  description: string;
  strict: boolean;
  input_schema: Record<string, unknown>;
};

export type ToolUseBlock = {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
};

export type TextBlock = { type: "text"; text: string };

export type ModelResponse = {
  content: Array<ToolUseBlock | TextBlock>;
  stop_reason?: string;
  usage?: Record<string, number>;
};

export type ModelMessage = {
  role: "user" | "assistant";
  content: string | Array<Record<string, unknown>>;
};

export type ModelRequest = {
  model: string;
  max_tokens: number;
  system: Array<Record<string, unknown>>;
  tools: ToolDef[];
  tool_choice: { type: "auto" };
  messages: ModelMessage[];
};

export type CallModel = (req: ModelRequest) => Promise<ModelResponse>;

export type ExtractContext = {
  landmarks: Landmark[];
  actors: Actor[];
  propTypes: PropType[];
  events: Event[];
  props: PropInstance[];
  recentSegments: Segment[];
};

export type BlockResult = {
  toolUseId: string;
  name: string;
  patches: Patch[];
  error?: string;
};

export type ExtractResult = {
  segmentId: string;
  patches: Patch[];
  unparsed: string[];
  attempts: number;
  skipped?: string;
};
