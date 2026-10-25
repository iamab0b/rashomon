import {
  ANTHROPIC_URL,
  ANTHROPIC_VERSION,
  EXTRACTION_MODEL,
  EXTRACTOR_TOOLS,
  NO_TOOL_CALL,
  NO_TOOL_CALL_NUDGE,
  SYSTEM_PROMPT,
  TRUNCATED,
  buildRequest,
  validateToolUses,
} from "@rashomon/extractor";
import type { ExtractContext, ModelMessage, ModelResponse, ToolUseBlock } from "@rashomon/extractor";
import props from "@rashomon/props";
import type { Patch, PropType, Segment } from "@rashomon/schema";
import { TimeDuration } from "spacetimedb";
import type { ReducerCtx, SyncResponse } from "spacetimedb/server";
import { eventGraphFromRow } from "../convert";
import { buildGraph, type ModuleSchema, type ReadDb } from "../graph";
import { applyPatchBatch, key, manifestFor } from "../reducers";
import { MAX_SEGMENT_TEXT_CHARS } from "../limits";
import { fnv1a64 } from "./hash";
import { mintPropIds } from "./props";

export const REQUEST_TIMEOUT_MS = 55_000;
export const MAX_RETRIES = 1;
export const PROMPT_HASH = fnv1a64(`${SYSTEM_PROMPT}\n${JSON.stringify(EXTRACTOR_TOOLS)}`);

export const EXTRACTION_FAILED = "extraction failed";
export const EXTRACTION_PARTLY_FAILED = "extraction partly failed";
export const UNKNOWN_SESSION = "unknown session";
export const UNKNOWN_SEGMENT = "unknown segment";

export type ErrorCode =
  | "no_api_key"
  | "segment_too_long"
  | "model_unreachable"
  | "model_error"
  | "bad_model_response"
  | "model_refused"
  | "bad_tool_output"
  | "truncated"
  | "partly_rejected"
  | "apply_failed";

export type Io = {
  apiKey: () => string | undefined;
  http: { fetch(url: string, init: { method: string; headers: Record<string, string>; body: string; timeout: TimeDuration }): SyncResponse };
  withTx<T>(body: (ctx: ReducerCtx<ModuleSchema>) => T): T;
};

export type HardFlag = { id: string; eventId: string; check: string; detail: string; suggestedQuestion: string };

export type Extraction = {
  segmentId: string;
  patchCount: number;
  statuses: { eventId: string; status: string }[];
  hardFlags: HardFlag[];
  error: string | undefined;
};

const done = (
  segmentId: string,
  patchCount: number,
  statuses: Extraction["statuses"],
  hardFlags: HardFlag[],
  error?: string,
): Extraction => ({ segmentId, patchCount, statuses, hardFlags, error });

export const openHardFlags = (db: ReadDb, sessionId: string): HardFlag[] => {
  const closed = new Set(
    [...db.events.sessionId.filter(sessionId)]
      .filter((e) => e.status === "overridden" || e.status === "superseded" || e.supersededBy !== undefined)
      .map((e) => e.id),
  );
  return [...db.flags.sessionId.filter(sessionId)]
    .filter((f) => f.severity === "hard" && !closed.has(f.eventId))
    .sort((a, b) => a.seq - b.seq)
    .map(({ id, eventId, check, detail, suggestedQuestion }) => ({ id, eventId, check, detail, suggestedQuestion }));
};

const statusesOf = (ctx: ReducerCtx<ModuleSchema>, sessionId: string): Extraction["statuses"] =>
  [...ctx.db.events.sessionId.filter(sessionId)].map((e) => ({ eventId: e.id, status: e.status }));

type SegmentRow = NonNullable<ReturnType<ReducerCtx<ModuleSchema>["db"]["segments"]["rowKey"]["find"]>>;

const storedResult = (ctx: ReducerCtx<ModuleSchema>, row: SegmentRow): Extraction =>
  done(
    row.id,
    row.extractPatchCount ?? 0,
    statusesOf(ctx, row.sessionId),
    openHardFlags(ctx.db, row.sessionId),
    row.extractError === undefined ? undefined : EXTRACTION_PARTLY_FAILED,
  );

const messageOf = (e: unknown): string => (e instanceof Error ? e.message : String(e));

const isToolUse = (b: { type: string }): b is ToolUseBlock => b.type === "tool_use";

type Snapshot =
  | { error: string }
  | { skipped: true }
  | { stored: Extraction }
  | { tooLong: number }
  | { segment: Segment; context: ExtractContext; utteranceIds: string[] };

function snapshot(io: Io, sessionId: string, segmentId: string): Snapshot {
  return io.withTx((ctx): Snapshot => {
    const session = ctx.db.sessions.id.find(sessionId);
    if (!session) return { error: UNKNOWN_SESSION };
    const row = ctx.db.segments.rowKey.find(key(sessionId, segmentId));
    if (!row || row.sessionId !== sessionId) return { error: UNKNOWN_SEGMENT };
    if (row.speaker !== "witness") return { skipped: true };
    if (row.extractedAt !== undefined) return { stored: storedResult(ctx, row) };
    if (row.text.length > MAX_SEGMENT_TEXT_CHARS) return { tooLong: row.text.length };
    const graphRow = buildGraph(ctx.db, sessionId);
    if (!graphRow) return { error: UNKNOWN_SESSION };
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
    const recent = [...ctx.db.segments.sessionId.filter(sessionId)]
      .filter((s) => s.id === segmentId || s.text.length <= MAX_SEGMENT_TEXT_CHARS)
      .map(toSegment);
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

const logFailure = (sessionId: string, segmentId: string, code: ErrorCode, detail: string): void =>
  console.error(`extract_segment ${sessionId}/${segmentId} ${code}: ${detail}`);

function recordError(io: Io, sessionId: string, segmentId: string, code: ErrorCode, detail: string): Extraction {
  logFailure(sessionId, segmentId, code, detail);
  io.withTx((ctx) => {
    const row = ctx.db.segments.rowKey.find(key(sessionId, segmentId));
    if (row) ctx.db.segments.rowKey.update({ ...row, extractError: code });
  });
  return done(segmentId, 0, [], [], EXTRACTION_FAILED);
}

type Gathered = { patches: Patch[]; unparsed: string[] } | { code: ErrorCode; detail: string };

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
      return { code: "model_unreachable", detail: scrub(`request to the model failed: ${messageOf(e)}`) };
    }
    if (response.status !== 200) {
      let detail = "";
      try {
        const parsed = response.json() as { error?: { message?: string } };
        detail = parsed?.error?.message ?? "";
      } catch {
        detail = "";
      }
      return { code: "model_error", detail: scrub(`Anthropic API ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`) };
    }
    let body: ModelResponse;
    try {
      body = response.json() as ModelResponse;
    } catch {
      return { code: "bad_model_response", detail: "the model response was not valid JSON" };
    }
    if (body.stop_reason === "refusal") return { code: "model_refused", detail: "the model refused this statement" };
    if (body.stop_reason === "max_tokens") {
      unparsed = [TRUNCATED];
      break;
    }
    const content = Array.isArray(body.content) ? body.content : [];
    const blocks = content.filter(isToolUse);
    if (blocks.length === 0) {
      unparsed = [NO_TOOL_CALL];
      if (attempt === MAX_RETRIES) break;
      if (content.length > 0) messages.push({ role: "assistant", content });
      messages.push({ role: "user", content: NO_TOOL_CALL_NUDGE });
      continue;
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
  if ("error" in snap) return done(segmentId, 0, [], [], snap.error);
  if ("skipped" in snap) return done(segmentId, 0, [], []);
  if ("stored" in snap) return snap.stored;
  if ("tooLong" in snap)
    return recordError(io, sessionId, segmentId, "segment_too_long", `${snap.tooLong} characters, over ${MAX_SEGMENT_TEXT_CHARS}`);

  let apiKey: string | undefined;
  try {
    apiKey = io.apiKey();
  } catch (e) {
    return recordError(io, sessionId, segmentId, "no_api_key", `reading ANTHROPIC_API_KEY failed: ${messageOf(e)}`);
  }
  if (!apiKey) return recordError(io, sessionId, segmentId, "no_api_key", "ANTHROPIC_API_KEY is not set on this module");

  const gathered = gather(io, apiKey, snap.segment, snap.context);
  if ("code" in gathered) return recordError(io, sessionId, segmentId, gathered.code, gathered.detail);
  const { unparsed } = gathered;
  const patches = mintPropIds(gathered.patches, snap.context);
  const truncated = unparsed.includes(TRUNCATED);
  if (patches.length === 0 && truncated)
    return recordError(io, sessionId, segmentId, TRUNCATED, "the reply reached max_tokens before it finished");
  if (patches.length === 0 && unparsed.length > 0)
    return recordError(io, sessionId, segmentId, "bad_tool_output", `validation failed: ${unparsed.join("; ")}`);

  const partial: ErrorCode | undefined = unparsed.length === 0 ? undefined : truncated ? TRUNCATED : "partly_rejected";
  if (partial !== undefined) logFailure(sessionId, segmentId, partial, `partly rejected: ${unparsed.join("; ")}`);
  try {
    return io.withTx((ctx) => {
      const session = ctx.db.sessions.id.find(sessionId);
      if (!session) throw new Error(`unknown session ${sessionId}`);
      const before = ctx.db.segments.rowKey.find(key(sessionId, segmentId));
      if (!before) throw new Error(`unknown segment ${segmentId}`);
      if (before.extractedAt !== undefined) return storedResult(ctx, before);
      if (patches.length > 0) applyPatchBatch(ctx, sessionId, session.version, patches);
      const row = ctx.db.segments.rowKey.find(key(sessionId, segmentId));
      if (!row) throw new Error(`unknown segment ${segmentId}`);
      ctx.db.segments.rowKey.update({
        ...row,
        extractModel: EXTRACTION_MODEL,
        extractPromptHash: PROMPT_HASH,
        extractUtteranceIds: snap.utteranceIds,
        extractedAt: ctx.timestamp,
        extractPatchCount: patches.length,
        extractError: partial,
      });
      const statuses = statusesOf(ctx, sessionId);
      const hardFlags = openHardFlags(ctx.db, sessionId);
      return done(segmentId, patches.length, statuses, hardFlags, partial === undefined ? undefined : EXTRACTION_PARTLY_FAILED);
    });
  } catch (e) {
    return recordError(io, sessionId, segmentId, "apply_failed", `applying the patches failed: ${messageOf(e)}`);
  }
}
