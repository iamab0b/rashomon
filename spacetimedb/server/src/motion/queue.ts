import { MAX_VERB_CHARS } from "@rashomon/schema";
import { ScheduleAt } from "spacetimedb/server";
import type { ReducerCtx } from "spacetimedb/server";
import type { ModuleSchema } from "../graph";
import { key } from "../reducers";

export const MAX_GENERATIONS_PER_SESSION = 5;
export const MIN_MOTION_S = 1;
export const MAX_MOTION_S = 4;

export const MOTION_PENDING = "pending";
export const MOTION_READY = "ready";
export const MOTION_FAILED = "failed";

const GENERATABLE_VERB = /^[a-z][a-z' -]*$/;

export function normalizeVerb(verb: string): string | undefined {
  const normalized = verb.trim().toLowerCase().replace(/\s+/g, " ");
  if (normalized.length > MAX_VERB_CHARS || !GENERATABLE_VERB.test(normalized)) return undefined;
  return normalized;
}

export const motionKey = (sessionId: string, verb: string): string => key(sessionId, verb);

export const motionLength = (tStart: number, tEnd: number): number => {
  const span = tEnd - tStart;
  if (!Number.isFinite(span)) return MIN_MOTION_S;
  return Math.min(MAX_MOTION_S, Math.max(MIN_MOTION_S, span));
};

type Wanted = { verb: string; lengthS: number };

function wantedVerbs(ctx: ReducerCtx<ModuleSchema>, sessionId: string): Wanted[] {
  const seen = new Set<string>();
  const wanted: Wanted[] = [];
  const rows = [...ctx.db.events.sessionId.filter(sessionId)].sort((a, b) => a.seq - b.seq);
  for (const event of rows) {
    if (event.actionApproximated !== true || event.verb === undefined) continue;
    if (event.status === "superseded" || event.supersededBy !== undefined) continue;
    const verb = normalizeVerb(event.verb);
    if (verb === undefined || seen.has(verb)) continue;
    seen.add(verb);
    wanted.push({ verb, lengthS: motionLength(event.tStart, event.tEnd) });
  }
  return wanted;
}

export function enqueueMotions(ctx: ReducerCtx<ModuleSchema>, sessionId: string): number {
  let used = [...ctx.db.generatedMotions.sessionId.filter(sessionId)].length;
  let queued = 0;
  for (const { verb, lengthS } of wantedVerbs(ctx, sessionId)) {
    if (used >= MAX_GENERATIONS_PER_SESSION) break;
    const rowKey = motionKey(sessionId, verb);
    if (ctx.db.generatedMotions.rowKey.find(rowKey)) continue;
    ctx.db.generatedMotions.insert({
      rowKey,
      sessionId,
      verb,
      motionId: undefined,
      characterId: undefined,
      status: MOTION_PENDING,
      error: undefined,
      requestedAt: ctx.timestamp,
    });
    ctx.db.motionQueue.insert({
      scheduledId: 0n,
      scheduledAt: ScheduleAt.time(ctx.timestamp.microsSinceUnixEpoch),
      sessionId,
      verb,
      lengthS,
    });
    used += 1;
    queued += 1;
  }
  return queued;
}
