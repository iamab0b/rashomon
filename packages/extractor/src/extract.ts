import type { Patch, Segment } from "@rashomon/schema";
import { buildRequest, EXTRACTION_MODEL, NO_TOOL_CALL, NO_TOOL_CALL_NUDGE, TRUNCATED } from "./prompt";
import type {
  CallModel,
  ExtractContext,
  ExtractResult,
  ModelMessage,
  ToolUseBlock,
} from "./types";
import { completeRelocation } from "./relocation";
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
    if (response.stop_reason === "max_tokens") {
      unparsed = [TRUNCATED];
      break;
    }
    const blocks = response.content.filter(isToolUse);
    if (blocks.length === 0) {
      unparsed = [NO_TOOL_CALL];
      if (attempt === maxRetries) break;
      if (response.content.length > 0) messages.push({ role: "assistant", content: response.content });
      messages.push({ role: "user", content: NO_TOOL_CALL_NUDGE });
      continue;
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

  const completed = completeRelocation(patches, segment, base);
  return {
    segmentId: segment.id,
    patches: completed.patches,
    unparsed,
    attempts,
    ...(completed.notes.length > 0 ? { notes: completed.notes } : {}),
  };
}
