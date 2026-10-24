import type { Patch, Segment } from "@rashomon/schema";
import { buildRequest, EXTRACTION_MODEL } from "./prompt";
import type {
  CallModel,
  ExtractContext,
  ExtractResult,
  ModelMessage,
  ToolUseBlock,
} from "./types";
import { validateToolUses } from "./validate";

export type ExtractOptions = {
  model?: string;
  maxRetries?: number;
};

const isToolUse = (b: { type: string }): b is ToolUseBlock =>
  b.type === "tool_use";

export async function extractSegment(
  segment: Segment,
  base: ExtractContext,
  callModel: CallModel,
  options: ExtractOptions = {},
): Promise<ExtractResult> {
  if (segment.speaker !== "witness")
    return {
      segmentId: segment.id,
      patches: [],
      unparsed: [],
      attempts: 0,
      skipped: `speaker is ${segment.speaker}; only witness statements are extracted`,
    };

  const maxRetries = options.maxRetries ?? 1;
  const first = buildRequest(segment, base, options.model ?? EXTRACTION_MODEL);
  const messages: ModelMessage[] = [...first.messages];
  const patches: Patch[] = [];
  let ctx = base;
  let unparsed: string[] = [];
  let attempts = 0;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    attempts++;
    const response = await callModel({ ...first, messages });
    const blocks = response.content.filter(isToolUse);
    if (blocks.length === 0) {
      unparsed = ["the model returned no tool call"];
      break;
    }
    const results = validateToolUses(blocks, segment, ctx);
    const accepted = results.flatMap((r) => r.patches);
    patches.push(...accepted);
    for (const p of accepted)
      if (p.op === "add_actor") ctx = { ...ctx, actors: [...ctx.actors, p.actor] };
    const failed = results.filter((r) => r.error !== undefined);
    unparsed = failed.map((r) => `${r.name}: ${r.error}`);
    if (failed.length === 0 || attempt === maxRetries) break;

    messages.push({ role: "assistant", content: response.content });
    messages.push({
      role: "user",
      content: results.map((r) => ({
        type: "tool_result",
        tool_use_id: r.toolUseId,
        content:
          r.error === undefined
            ? "Accepted. Do not send this one again."
            : `Rejected: ${r.error}. Send a corrected call for this change only.`,
        is_error: r.error !== undefined,
      })),
    });
  }

  return { segmentId: segment.id, patches, unparsed, attempts };
}
