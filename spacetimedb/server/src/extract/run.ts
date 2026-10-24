import {
  ANTHROPIC_URL,
  ANTHROPIC_VERSION,
  EXTRACTION_MODEL,
  EXTRACTOR_TOOLS,
  SYSTEM_PROMPT,
  buildRequest,
  validateToolUses,
} from "@rashomon/extractor";
import type { ExtractContext, ModelMessage, ModelResponse, ToolUseBlock } from "@rashomon/extractor";
import props from "@rashomon/props";
import type { Patch, PropType, Segment } from "@rashomon/schema";
import { TimeDuration } from "spacetimedb";
import type { ReducerCtx, SyncResponse } from "spacetimedb/server";
import { eventGraphFromRow } from "../convert";
import { buildGraph, type ModuleSchema } from "../graph";
import { applyPatchBatch, key, manifestFor } from "../reducers";
import { fnv1a64 } from "./hash";
import { mintPropIds } from "./props";

export const REQUEST_TIMEOUT_MS = 60_000;
export const MAX_RETRIES = 1;
export const PROMPT_HASH = fnv1a64(`${SYSTEM_PROMPT}\n${JSON.stringify(EXTRACTOR_TOOLS)}`);

export type Io = {
  apiKey: () => string | undefined;
  http: { fetch(url: string, init: { method: string; headers: Record<string, string>; body: string; timeout: TimeDuration }): SyncResponse };
  withTx<T>(body: (ctx: ReducerCtx<ModuleSchema>) => T): T;
};

export type Extraction = {
  segmentId: string;
  patchCount: number;
  statuses: { eventId: string; status: string }[];
  error: string | undefined;
};

const done = (segmentId: string, patchCount: number, statuses: Extraction["statuses"], error?: string): Extraction => ({
  segmentId,
  patchCount,
  statuses,
  error,
});

const messageOf = (e: unknown): string => (e instanceof Error ? e.message : String(e));

const isToolUse = (b: { type: string }): b is ToolUseBlock => b.type === "tool_use";

type Snapshot =
  | { error: string }
  | { skipped: true }
  | { segment: Segment; context: ExtractContext; utteranceIds: string[] };

function snapshot(io: Io, sessionId: string, segmentId: string): Snapshot {
  return io.withTx((ctx): Snapshot => {
    const session = ctx.db.sessions.id.find(sessionId);
    if (!session) return { error: `unknown session ${sessionId}` };
    const row = ctx.db.segments.rowKey.find(key(sessionId, segmentId));
    if (!row || row.sessionId !== sessionId) return { error: `unknown segment ${segmentId}` };
    if (row.speaker !== "witness") return { skipped: true };
    const graphRow = buildGraph(ctx.db, sessionId);
    if (!graphRow) return { error: `unknown session ${sessionId}` };
    const graph = eventGraphFromRow(graphRow);
    const toSegment = (s: typeof row): Segment => ({
      id: s.id,
      sessionId: s.sessionId,
      witnessId: s.witnessId,
      speaker: s.speaker as Segment["speaker"],
      text: s.text,
      t: [s.tStart, s.tEnd],
      source: s.source as Segment["source"],
      ...(s.supersedes !== undefined ? { supersedes: s.supersedes } : {}),
    });
    const recent = [...ctx.db.segments.sessionId.filter(sessionId)].map(toSegment);
    return {
      segment: toSegment(row),
      utteranceIds: [...ctx.db.utterances.segmentKey.filter(key(sessionId, segmentId))].map((u) => u.id),
      context: {
        landmarks: manifestFor(session.sceneId).landmarks,
        actors: graph.actors,
        propTypes: props as PropType[],
        events: graph.events,
        props: graph.props,
        recentSegments: recent,
      },
    };
  });
}

function recordError(io: Io, sessionId: string, segmentId: string, error: string): Extraction {
  io.withTx((ctx) => {
    const row = ctx.db.segments.rowKey.find(key(sessionId, segmentId));
    if (row) ctx.db.segments.rowKey.update({ ...row, extractError: error });
  });
  return done(segmentId, 0, [], error);
}

type Gathered = { patches: Patch[]; unparsed: string[] } | { error: string };

function gather(io: Io, apiKey: string, segment: Segment, base: ExtractContext): Gathered {
  const scrub = (text: string): string => text.split(apiKey).join("[redacted]");
  const first = buildRequest(segment, base, EXTRACTION_MODEL);
  const messages: ModelMessage[] = [...first.messages];
  const patches: Patch[] = [];
  let context = base;
  let unparsed: string[] = [];

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    let response;
    try {
      response = io.http.fetch(ANTHROPIC_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
        },
        body: JSON.stringify({ ...first, messages }),
        timeout: TimeDuration.fromMillis(REQUEST_TIMEOUT_MS),
      });
    } catch (e) {
      return { error: scrub(`request to the model failed: ${messageOf(e)}`) };
    }
    if (response.status !== 200) {
      let detail = "";
      try {
        const parsed = response.json() as { error?: { message?: string } };
        detail = parsed?.error?.message ?? "";
      } catch {
        detail = "";
      }
      return { error: scrub(`Anthropic API ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`) };
    }
    let body: ModelResponse;
    try {
      body = response.json() as ModelResponse;
    } catch {
      return { error: "the model response was not valid JSON" };
    }
    if (body.stop_reason === "refusal") return { error: "the model refused this statement" };
    const blocks = (Array.isArray(body.content) ? body.content : []).filter(isToolUse);
    if (blocks.length === 0) {
      unparsed = ["the model returned no tool call"];
      break;
    }
    const results = validateToolUses(blocks, segment, context);
    const accepted = results.flatMap((r) => r.patches);
    patches.push(...accepted);
    for (const p of accepted) if (p.op === "add_actor") context = { ...context, actors: [...context.actors, p.actor] };
    const failed = results.filter((r) => r.error !== undefined);
    unparsed = failed.map((r) => `${r.name}: ${r.error}`);
    if (failed.length === 0 || attempt === MAX_RETRIES) break;
    messages.push({ role: "assistant", content: body.content });
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
  return { patches, unparsed };
}

export function runExtraction(io: Io, sessionId: string, segmentId: string): Extraction {
  const snap = snapshot(io, sessionId, segmentId);
  if ("error" in snap) return done(segmentId, 0, [], snap.error);
  if ("skipped" in snap) return done(segmentId, 0, []);

  const apiKey = io.apiKey();
  if (!apiKey) return recordError(io, sessionId, segmentId, "ANTHROPIC_API_KEY is not set on this module");

  const gathered = gather(io, apiKey, snap.segment, snap.context);
  if ("error" in gathered) return recordError(io, sessionId, segmentId, gathered.error);
  const { unparsed } = gathered;
  const patches = mintPropIds(gathered.patches, snap.context);
  if (patches.length === 0 && unparsed.length > 0)
    return recordError(io, sessionId, segmentId, `validation failed: ${unparsed.join("; ")}`);

  const partial = unparsed.length > 0 ? `partly rejected: ${unparsed.join("; ")}` : undefined;
  try {
    return io.withTx((ctx) => {
      const session = ctx.db.sessions.id.find(sessionId);
      if (!session) throw new Error(`unknown session ${sessionId}`);
      if (patches.length > 0) applyPatchBatch(ctx, sessionId, session.version, patches);
      const row = ctx.db.segments.rowKey.find(key(sessionId, segmentId));
      if (!row) throw new Error(`unknown segment ${segmentId}`);
      ctx.db.segments.rowKey.update({
        ...row,
        extractModel: EXTRACTION_MODEL,
        extractPromptHash: PROMPT_HASH,
        extractUtteranceIds: snap.utteranceIds,
        extractedAt: ctx.timestamp,
        extractError: partial,
      });
      const statuses = [...ctx.db.events.sessionId.filter(sessionId)].map((e) => ({ eventId: e.id, status: e.status }));
      return done(segmentId, patches.length, statuses, partial);
    });
  } catch (e) {
    return recordError(io, sessionId, segmentId, `applying the patches failed: ${messageOf(e)}`);
  }
}
