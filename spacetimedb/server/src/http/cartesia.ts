import { Router, SyncResponse, type ReducerCtx, type Request } from "spacetimedb/server";
import type { Anchor } from "@rashomon/schema";
import { eventGraphFromRow } from "../convert";
import { fnv1a64 } from "../extract/hash";
import { EXTRACTION_FAILED, UNKNOWN_SESSION, openHardFlags, runExtraction, type Extraction, type Io } from "../extract/run";
import { buildGraph, type ModuleSchema, type ReadDb } from "../graph";
import { MAX_BODY_BYTES, MAX_SEGMENT_TEXT_CHARS, MAX_UTTERANCES } from "../limits";
import { insertSegmentRow, key, manifestFor } from "../reducers";
import { spacetimedb } from "../tables";

export type WebhookIo = Io & { webhookSecret: () => string | undefined };

export const SECRET_HEADER = "x-rashomon-webhook-secret";
export const SECONDS_PER_WORD = 0.4;
export const RECENT_EVENTS = 5;
export const RETRY_WINDOW_MICROS = 15_000_000n;

export type SceneContext = {
  landmarks: { id: string; label: string }[];
  recentEvents: { id: string; actor: string; action: string; where: string | null; status: string }[];
  openQuestions: { eventId: string; question: string }[];
  nextQuestion: string | null;
};

export type InterviewSummary = { ended: true; statements: number; events: number; openQuestions: number };

export type AskBack = { flagId: string; eventId: string; question: string };

export type WebhookOutcome = {
  status: number;
  body: ToolResponse | Extraction | SceneContext | InterviewSummary | { error: string };
};

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

const firstString = (o: Record<string, unknown>, names: string[]): string | undefined => {
  for (const n of names) {
    const v = o[n];
    if (typeof v === "string" && v.trim() !== "") return v;
  }
  return undefined;
};

const firstNumber = (o: Record<string, unknown>, names: string[]): number | undefined => {
  for (const n of names) {
    const v = o[n];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return undefined;
};

const bad = (error: string): WebhookOutcome => ({ status: 400, body: { error } });

export function secretsMatch(given: string, expected: string): boolean {
  const n = Math.max(given.length, expected.length);
  let diff = given.length ^ expected.length;
  for (let i = 0; i < n; i++) diff |= (given.charCodeAt(i) | 0) ^ (expected.charCodeAt(i) | 0);
  return diff === 0;
}

const readSecret = (io: WebhookIo): string | undefined => {
  try {
    return io.webhookSecret();
  } catch {
    return undefined;
  }
};

export const defaultSegmentId = (
  sessionId: string,
  witnessId: string,
  utterances: { text: string; tStart?: number; tEnd?: number }[],
  priorSegments: number,
): string =>
  `seg_${fnv1a64(JSON.stringify([sessionId, witnessId, priorSegments, utterances.map((u) => [u.text, u.tStart ?? null, u.tEnd ?? null])]))}`;

const segmentCount = (db: ReadDb, sessionId: string): number => {
  let n = 0;
  for (const s of db.segments.sessionId.filter(sessionId)) if (s.sessionId === sessionId) n++;
  return n;
};

export function resolveSegmentId(
  db: ReadDb,
  sessionId: string,
  witnessId: string,
  parts: { text: string; tStart?: number; tEnd?: number }[],
): string {
  const prior = segmentCount(db, sessionId);
  if (prior > 0) {
    const previous = defaultSegmentId(sessionId, witnessId, parts, prior - 1);
    if (db.segments.rowKey.find(key(sessionId, previous))) return previous;
  }
  return defaultSegmentId(sessionId, witnessId, parts, prior);
}

export function plainSegmentId(ctx: ReducerCtx<ModuleSchema>, sessionId: string, witnessId: string, text: string): string {
  let latest: { segmentId: string; seq: number; text: string; storedAt: { microsSinceUnixEpoch: bigint } } | undefined;
  for (const w of ctx.db.webhookStatements.sessionId.filter(sessionId)) {
    if (w.sessionId !== sessionId || w.witnessId !== witnessId) continue;
    if (!latest || w.seq > latest.seq) latest = w;
  }
  if (latest && latest.text === text) {
    const since = ctx.db.segments.rowKey.find(key(sessionId, latest.segmentId))?.extractedAt ?? latest.storedAt;
    if (ctx.timestamp.microsSinceUnixEpoch - since.microsSinceUnixEpoch < RETRY_WINDOW_MICROS) return latest.segmentId;
  }
  return defaultSegmentId(sessionId, witnessId, [{ text }], segmentCount(ctx.db, sessionId));
}

function recordStatement(ctx: ReducerCtx<ModuleSchema>, sessionId: string, segmentId: string, witnessId: string, text: string): void {
  ctx.db.webhookStatements.insert({
    rowKey: key(sessionId, segmentId),
    sessionId,
    segmentId,
    seq: segmentCount(ctx.db, sessionId),
    witnessId,
    text,
    storedAt: ctx.timestamp,
    askFlagId: undefined,
  });
}

export const MAX_TOOL_RESPONSE_BYTES = 16 * 1024;

const utf8Length = (text: string): number => new TextEncoder().encode(text).length;

export type ToolResponse = {
  askNext: AskBack | null;
  segmentId: string;
  patchCount: number;
  error: string | undefined;
  statuses: Extraction["statuses"];
  hardFlags: Extraction["hardFlags"];
  truncated?: true;
};

export function toolResponse(result: Extraction, askNext: AskBack | null): ToolResponse {
  const body: ToolResponse = {
    askNext,
    segmentId: result.segmentId,
    patchCount: result.patchCount,
    error: result.error,
    statuses: [...result.statuses],
    hardFlags: [...result.hardFlags],
  };
  if (utf8Length(JSON.stringify(body)) <= MAX_TOOL_RESPONSE_BYTES) return body;
  body.truncated = true;
  const itemBytes = (item: unknown): number => utf8Length(JSON.stringify(item)) + 1;
  const statusBytes = body.statuses.map(itemBytes);
  const flagBytes = body.hardFlags.map(itemBytes);
  let total = utf8Length(JSON.stringify(body));
  let statusTotal = statusBytes.reduce((a, b) => a + b, 0);
  let flagTotal = flagBytes.reduce((a, b) => a + b, 0);
  while (total > MAX_TOOL_RESPONSE_BYTES && (body.statuses.length > 0 || body.hardFlags.length > 0)) {
    const fromFlags = body.statuses.length === 0 || (body.hardFlags.length > 0 && flagTotal >= statusTotal);
    const removed = fromFlags ? flagBytes.pop()! : statusBytes.pop()!;
    if (fromFlags) {
      body.hardFlags.pop();
      flagTotal -= removed;
    } else {
      body.statuses.pop();
      statusTotal -= removed;
    }
    total -= removed;
  }
  while (utf8Length(JSON.stringify(body)) > MAX_TOOL_RESPONSE_BYTES && (body.statuses.length > 0 || body.hardFlags.length > 0)) {
    if (body.hardFlags.length > 0) body.hardFlags.pop();
    else body.statuses.pop();
  }
  return body;
}

type Authorized = { body: Record<string, unknown>; sessionId: string };

function authorize(io: WebhookIo, req: Request): Authorized | WebhookOutcome {
  const expected = readSecret(io);
  const given = req.headers.get(SECRET_HEADER);
  if (!expected || given === null || !secretsMatch(given, expected)) return { status: 401, body: { error: "unauthorized" } };

  if (req.bytes().length > MAX_BODY_BYTES) return { status: 413, body: { error: `the body must be at most ${MAX_BODY_BYTES} bytes` } };

  let body: unknown;
  try {
    body = JSON.parse(req.text());
  } catch {
    return bad("the body must be JSON");
  }
  if (!isRecord(body)) return bad("the body must be a JSON object");
  const sessionId = firstString(body, ["sessionId", "session_id"]);
  if (!sessionId) return bad("sessionId is required");
  return { body, sessionId };
}

const isOutcome = (v: Authorized | WebhookOutcome): v is WebhookOutcome => "status" in v;

type Parsed = { id: string | undefined; text: string; tStart: number; tEnd: number };

export function handleCartesia(io: WebhookIo, req: Request): WebhookOutcome {
  const auth = authorize(io, req);
  if (isOutcome(auth)) return auth;
  const { body, sessionId } = auth;
  const witnessId = firstString(body, ["witnessId", "witness_id", "witness", "witnessName", "witness_name"]) ?? "witness";
  const givenId = firstString(body, ["segmentId", "segment_id"]);

  let text: string;
  let parsed: Parsed[] | undefined;
  if (body.utterances === undefined) {
    const plain = firstString(body, ["text"]);
    if (!plain) return bad("text or utterances is required");
    text = plain.trim();
  } else {
    if (!Array.isArray(body.utterances) || body.utterances.length === 0) return bad("utterances must be a non-empty array");
    if (body.utterances.length > MAX_UTTERANCES) return bad(`at most ${MAX_UTTERANCES} utterances per request`);
    parsed = [];
    for (const [i, raw] of body.utterances.entries()) {
      if (!isRecord(raw)) return bad(`utterance ${i} must be an object`);
      const uText = firstString(raw, ["text"]);
      const tStart = firstNumber(raw, ["tStart", "t_start"]);
      const tEnd = firstNumber(raw, ["tEnd", "t_end"]);
      if (!uText) return bad(`utterance ${i} needs text`);
      if (tStart === undefined || tEnd === undefined || tStart > tEnd) return bad(`utterance ${i} needs tStart and tEnd in order`);
      parsed.push({ id: firstString(raw, ["id"]), text: uText, tStart, tEnd });
    }
    text = parsed.map((u) => u.text).join(" ");
  }

  if (text.length > MAX_SEGMENT_TEXT_CHARS)
    return { status: 413, body: { error: `the text must be at most ${MAX_SEGMENT_TEXT_CHARS} characters` } };

  let segmentId: string;
  try {
    segmentId = io.withTx((ctx) => {
      const id = givenId ?? (parsed ? resolveSegmentId(ctx.db, sessionId, witnessId, parsed) : plainSegmentId(ctx, sessionId, witnessId, text));
      const existing = ctx.db.segments.rowKey.find(key(sessionId, id));
      if (existing && existing.sessionId === sessionId && existing.text === text) {
        if (!ctx.db.webhookStatements.rowKey.find(key(sessionId, id))) recordStatement(ctx, sessionId, id, witnessId, text);
        return id;
      }
      let lines: { id: string; text: string; tStart: number; tEnd: number }[];
      if (parsed) {
        lines = parsed.map((u, i) => ({ ...u, id: u.id ?? `${id}_u${i + 1}` }));
      } else {
        let start = 0;
        for (const s of ctx.db.segments.sessionId.filter(sessionId)) if (s.sessionId === sessionId && s.tEnd > start) start = s.tEnd;
        const words = text.split(/\s+/).filter(Boolean).length;
        const end = Math.round((start + Math.max(1, words * SECONDS_PER_WORD)) * 10) / 10;
        lines = [{ id: `${id}_u1`, text, tStart: start, tEnd: end }];
      }
      let tStart = Infinity;
      let tEnd = -Infinity;
      for (const u of lines) {
        if (u.tStart < tStart) tStart = u.tStart;
        if (u.tEnd > tEnd) tEnd = u.tEnd;
      }
      insertSegmentRow(ctx, {
        id,
        sessionId,
        witnessId,
        speaker: "witness",
        text,
        tStart,
        tEnd,
        source: "live",
        supersedes: undefined,
        utterances: lines,
      });
      recordStatement(ctx, sessionId, id, witnessId, text);
      return id;
    });
  } catch {
    return bad("the segment could not be stored");
  }
  const result = runExtraction(io, sessionId, segmentId);
  if (result.error === EXTRACTION_FAILED) return { status: 502, body: { error: EXTRACTION_FAILED } };
  let askNext: AskBack | null;
  try {
    askNext = io.withTx((ctx) => askFor(ctx, sessionId, segmentId));
  } catch {
    askNext = null;
  }
  return { status: 200, body: toolResponse(result, askNext) };
}

const toAskBack = (f: { id: string; eventId: string; suggestedQuestion: string }): AskBack => ({
  flagId: f.id,
  eventId: f.eventId,
  question: f.suggestedQuestion,
});

export function peekNextQuestion(db: ReadDb, sessionId: string): AskBack | null {
  const next = openHardFlags(db, sessionId).find((f) => !db.askedFlags.rowKey.find(key(sessionId, f.id)));
  return next ? toAskBack(next) : null;
}

export function takeNextQuestion(ctx: ReducerCtx<ModuleSchema>, sessionId: string): AskBack | null {
  const next = peekNextQuestion(ctx.db, sessionId);
  if (next) ctx.db.askedFlags.insert({ rowKey: key(sessionId, next.flagId), sessionId, flagId: next.flagId, askedAt: ctx.timestamp });
  return next;
}

export function askFor(ctx: ReducerCtx<ModuleSchema>, sessionId: string, segmentId: string): AskBack | null {
  const statement = ctx.db.webhookStatements.rowKey.find(key(sessionId, segmentId));
  if (statement?.askFlagId !== undefined) {
    const kept = openHardFlags(ctx.db, sessionId).find((f) => f.id === statement.askFlagId);
    return kept ? toAskBack(kept) : null;
  }
  const next = takeNextQuestion(ctx, sessionId);
  if (statement && next) ctx.db.webhookStatements.rowKey.update({ ...statement, askFlagId: next.flagId });
  return next;
}

const anchorLandmark = (a: Anchor | undefined): string | undefined =>
  a === undefined || a.kind === "xyz" ? undefined : a.kind === "between" ? a.a : a.landmark;

function sceneContextOf(ctx: ReducerCtx<ModuleSchema>, sessionId: string): SceneContext | undefined {
  const row = buildGraph(ctx.db, sessionId);
  if (!row) return undefined;
  const graph = eventGraphFromRow(row);
  const manifest = manifestFor(row.sceneId);
  const labels = new Map(manifest.landmarks.map((l) => [l.id, l.label]));
  const actors = new Map(graph.actors.map((a) => [a.id, a.label]));
  const live = graph.events.filter((e) => e.status !== "superseded" && e.supersededBy === undefined);
  const recentEvents = live.slice(-RECENT_EVENTS).map((e) => {
    const landmark = anchorLandmark(e.at) ?? anchorLandmark(e.to) ?? anchorLandmark(e.from);
    return {
      id: e.id,
      actor: actors.get(e.actor) ?? e.actor,
      action: e.action,
      where: landmark === undefined ? null : (labels.get(landmark) ?? landmark),
      status: e.status,
    };
  });
  const openQuestions = openHardFlags(ctx.db, sessionId).map((f) => ({ eventId: f.eventId, question: f.suggestedQuestion }));
  return {
    landmarks: manifest.landmarks.map((l) => ({ id: l.id, label: l.label })),
    recentEvents,
    openQuestions,
    nextQuestion: peekNextQuestion(ctx.db, sessionId)?.question ?? null,
  };
}

function interviewSummaryOf(ctx: ReducerCtx<ModuleSchema>, sessionId: string): InterviewSummary | undefined {
  if (!ctx.db.sessions.id.find(sessionId)) return undefined;
  const statements = [...ctx.db.segments.sessionId.filter(sessionId)].filter((s) => s.speaker === "witness").length;
  const events = [...ctx.db.events.sessionId.filter(sessionId)].filter((e) => e.status !== "superseded").length;
  const openQuestions = openHardFlags(ctx.db, sessionId).length;
  return { ended: true, statements, events, openQuestions };
}

const READ_FAILED: WebhookOutcome = { status: 500, body: { error: "the session could not be read" } };

function readSession<T extends SceneContext | InterviewSummary>(
  io: WebhookIo,
  req: Request,
  read: (ctx: ReducerCtx<ModuleSchema>, sessionId: string) => T | undefined,
): { outcome: WebhookOutcome; sessionId?: string; value?: T } {
  const auth = authorize(io, req);
  if (isOutcome(auth)) return { outcome: auth };
  let value: T | undefined;
  try {
    value = io.withTx((ctx) => read(ctx, auth.sessionId));
  } catch {
    return { outcome: READ_FAILED };
  }
  if (!value) return { outcome: bad(UNKNOWN_SESSION) };
  return { outcome: { status: 200, body: value }, sessionId: auth.sessionId, value };
}

export function handleSceneContext(io: WebhookIo, req: Request): WebhookOutcome {
  return readSession(io, req, sceneContextOf).outcome;
}

export function handleEndInterview(io: WebhookIo, req: Request): WebhookOutcome {
  const { outcome, sessionId, value } = readSession(io, req, interviewSummaryOf);
  if (value) console.log(`interview ended for ${sessionId}: ${value.statements} statements, ${value.events} events`);
  return outcome;
}

const respond = (handle: (io: WebhookIo, req: Request) => WebhookOutcome) =>
  spacetimedb.httpHandler((ctx, req) => {
    const outcome = handle(
      {
        apiKey: () => ctx.env.ANTHROPIC_API_KEY,
        webhookSecret: () => ctx.env.CARTESIA_WEBHOOK_SECRET,
        http: ctx.http,
        withTx: (body) => ctx.withTx(body),
      },
      req,
    );
    return new SyncResponse(JSON.stringify(outcome.body), {
      status: outcome.status,
      headers: { "content-type": "application/json" },
    });
  });

export const cartesiaWebhook = respond(handleCartesia);
export const sceneContextWebhook = respond(handleSceneContext);
export const endInterviewWebhook = respond(handleEndInterview);

export const router = spacetimedb.httpRouter(
  new Router()
    .post("/webhook/cartesia", cartesiaWebhook)
    .post("/webhook/cartesia/record_statement", cartesiaWebhook)
    .post("/webhook/cartesia/scene_context", sceneContextWebhook)
    .post("/webhook/cartesia/end_interview", endInterviewWebhook),
);
