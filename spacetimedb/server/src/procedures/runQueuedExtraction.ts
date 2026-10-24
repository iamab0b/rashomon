import type { Identity } from "spacetimedb";
import { t } from "spacetimedb/server";
import type { Io } from "../extract/run";
import { extractionQueue, spacetimedb } from "../tables";
import { extractAs } from "./extractSegment";

export function runQueuedAs(
  caller: { sender: Identity; databaseIdentity: Identity },
  io: () => Io,
  row: { sessionId: string; segmentId: string },
): void {
  extractAs(caller, io, row.sessionId, row.segmentId);
}

export const runQueuedExtraction = spacetimedb.procedure(
  { onSchedule: extractionQueue },
  { job: extractionQueue.rowType },
  t.unit(),
  (ctx, { job }) => {
    runQueuedAs(
      ctx,
      () => ({ apiKey: () => ctx.env.ANTHROPIC_API_KEY, http: ctx.http, withTx: (body) => ctx.withTx(body) }),
      job,
    );
    return {};
  },
);
