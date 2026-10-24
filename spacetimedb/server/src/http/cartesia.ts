import { Router, SyncResponse } from "spacetimedb/server";
import { runExtraction, type Extraction, type Io } from "../extract/run";
import { insertSegment } from "../reducers";
import { spacetimedb } from "../tables";

export type WebhookIo = Io & { nowMicros: () => bigint };

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

export function handleCartesia(io: WebhookIo, bodyText: string): WebhookOutcome {
  let body: unknown;
  try {
    body = JSON.parse(bodyText);
  } catch {
    return bad("the body must be JSON");
  }
  if (!isRecord(body)) return bad("the body must be a JSON object");
  const sessionId = firstString(body, ["sessionId", "session_id"]);
  if (!sessionId) return bad("sessionId is required");
  if (!Array.isArray(body.utterances) || body.utterances.length === 0) return bad("utterances must be a non-empty array");

  const segmentId = firstString(body, ["segmentId", "segment_id"]) ?? `seg_${io.nowMicros()}`;
  const witnessId = firstString(body, ["witnessId", "witness_id", "witness", "witnessName", "witness_name"]) ?? "witness";
  const utterances: { id: string; text: string; tStart: number; tEnd: number }[] = [];
  for (const [i, raw] of body.utterances.entries()) {
    if (!isRecord(raw)) return bad(`utterance ${i} must be an object`);
    const text = firstString(raw, ["text"]);
    const tStart = firstNumber(raw, ["tStart", "t_start"]);
    const tEnd = firstNumber(raw, ["tEnd", "t_end"]);
    if (!text) return bad(`utterance ${i} needs text`);
    if (tStart === undefined || tEnd === undefined || tStart > tEnd) return bad(`utterance ${i} needs tStart and tEnd in order`);
    utterances.push({ id: firstString(raw, ["id"]) ?? `${segmentId}_u${i + 1}`, text, tStart, tEnd });
  }

  try {
    io.withTx((ctx) =>
      insertSegment(ctx, {
        id: segmentId,
        sessionId,
        witnessId,
        speaker: "witness",
        text: utterances.map((u) => u.text).join(" "),
        tStart: Math.min(...utterances.map((u) => u.tStart)),
        tEnd: Math.max(...utterances.map((u) => u.tEnd)),
        source: "live",
        supersedes: undefined,
        utterances,
      }),
    );
  } catch (e) {
    return bad(e instanceof Error ? e.message : String(e));
  }
  return { status: 200, body: runExtraction(io, sessionId, segmentId) };
}

export const cartesiaWebhook = spacetimedb.httpHandler((ctx, req) => {
  const outcome = handleCartesia(
    {
      apiKey: () => ctx.env.ANTHROPIC_API_KEY,
      http: ctx.http,
      withTx: (body) => ctx.withTx(body),
      nowMicros: () => ctx.timestamp.microsSinceUnixEpoch,
    },
    req.text(),
  );
  return new SyncResponse(JSON.stringify(outcome.body), {
    status: outcome.status,
    headers: { "content-type": "application/json" },
  });
});

export const router = spacetimedb.httpRouter(new Router().post("/webhook/cartesia", cartesiaWebhook));
