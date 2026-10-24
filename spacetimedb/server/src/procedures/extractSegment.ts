import type { Identity } from "spacetimedb";
import { SenderError, t } from "spacetimedb/server";
import { runExtraction, type Extraction, type Io } from "../extract/run";
import { ExtractionT, spacetimedb } from "../tables";

export const NOT_THE_MODULE = "extract_segment can only be called by the module itself";

export function extractAs(
  caller: { sender: Identity; databaseIdentity: Identity },
  io: () => Io,
  sessionId: string,
  segmentId: string,
): Extraction {
  if (!caller.sender.isEqual(caller.databaseIdentity)) throw new SenderError(NOT_THE_MODULE);
  return runExtraction(io(), sessionId, segmentId);
}

export const extractSegment = spacetimedb.procedure(
  { sessionId: t.string(), segmentId: t.string() },
  ExtractionT,
  (ctx, { sessionId, segmentId }) =>
    extractAs(
      ctx,
      () => ({ apiKey: () => ctx.env.ANTHROPIC_API_KEY, http: ctx.http, withTx: (body) => ctx.withTx(body) }),
      sessionId,
      segmentId,
    ),
);
