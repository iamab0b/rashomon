import { Router, SyncResponse, type Request } from "spacetimedb/server";
import { fnv1a64 } from "../extract/hash";
import { EXTRACTION_FAILED, runExtraction, type Extraction, type Io } from "../extract/run";
import { MAX_BODY_BYTES, MAX_UTTERANCES } from "../limits";
import { insertSegmentRow, key } from "../reducers";
import { spacetimedb } from "../tables";

export type WebhookIo = Io & { webhookSecret: () => string | undefined };

export const SECRET_HEADER = "x-rashomon-webhook-secret";

export type WebhookOutcome = { status: number; body: Extraction | { error: string } };

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

export const defaultSegmentId = (sessionId: string, utterances: { text: string; tStart: number; tEnd: number }[]): string =>
  `seg_${fnv1a64(JSON.stringify([sessionId, utterances.map((u) => [u.text, u.tStart, u.tEnd])]))}`;

export function handleCartesia(io: WebhookIo, req: Request): WebhookOutcome {
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
  if (!Array.isArray(body.utterances) || body.utterances.length === 0) return bad("utterances must be a non-empty array");
  if (body.utterances.length > MAX_UTTERANCES) return bad(`at most ${MAX_UTTERANCES} utterances per request`);

  const witnessId = firstString(body, ["witnessId", "witness_id", "witness", "witnessName", "witness_name"]) ?? "witness";
  const parsed: { id: string | undefined; text: string; tStart: number; tEnd: number }[] = [];
  for (const [i, raw] of body.utterances.entries()) {
    if (!isRecord(raw)) return bad(`utterance ${i} must be an object`);
    const text = firstString(raw, ["text"]);
    const tStart = firstNumber(raw, ["tStart", "t_start"]);
    const tEnd = firstNumber(raw, ["tEnd", "t_end"]);
    if (!text) return bad(`utterance ${i} needs text`);
    if (tStart === undefined || tEnd === undefined || tStart > tEnd) return bad(`utterance ${i} needs tStart and tEnd in order`);
    parsed.push({ id: firstString(raw, ["id"]), text, tStart, tEnd });
  }
  const segmentId = firstString(body, ["segmentId", "segment_id"]) ?? defaultSegmentId(sessionId, parsed);
  const utterances = parsed.map((u, i) => ({ ...u, id: u.id ?? `${segmentId}_u${i + 1}` }));

  const text = utterances.map((u) => u.text).join(" ");
  try {
    io.withTx((ctx) => {
      const existing = ctx.db.segments.rowKey.find(key(sessionId, segmentId));
      if (existing && existing.sessionId === sessionId && existing.text === text) return;
      insertSegmentRow(ctx, {
        id: segmentId,
        sessionId,
        witnessId,
        speaker: "witness",
        text,
        tStart: Math.min(...utterances.map((u) => u.tStart)),
        tEnd: Math.max(...utterances.map((u) => u.tEnd)),
        source: "live",
        supersedes: undefined,
        utterances,
      });
    });
  } catch {
    return bad("the segment could not be stored");
  }
  const result = runExtraction(io, sessionId, segmentId);
  if (result.error === EXTRACTION_FAILED) return { status: 502, body: { error: EXTRACTION_FAILED } };
  return { status: 200, body: result };
}

export const cartesiaWebhook = spacetimedb.httpHandler((ctx, req) => {
  const outcome = handleCartesia(
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

export const router = spacetimedb.httpRouter(new Router().post("/webhook/cartesia", cartesiaWebhook));
