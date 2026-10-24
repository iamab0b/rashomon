import { t } from "spacetimedb/server";
import { runExtraction } from "../extract/run";
import { ExtractionT, spacetimedb } from "../tables";

export const extractSegment = spacetimedb.procedure(
  { sessionId: t.string(), segmentId: t.string() },
  ExtractionT,
  (ctx, { sessionId, segmentId }) =>
    runExtraction(
      { apiKey: () => ctx.env.ANTHROPIC_API_KEY, http: ctx.http, withTx: (body) => ctx.withTx(body) },
      sessionId,
      segmentId,
    ),
);
