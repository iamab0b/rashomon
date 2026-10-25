import { t } from "spacetimedb/server";
import { generateAs } from "../motion/generate";
import { motionQueue, spacetimedb } from "../tables";

export const runMotionGeneration = spacetimedb.procedure(
  { onSchedule: motionQueue },
  { job: motionQueue.rowType },
  t.unit(),
  (ctx, { job }) => {
    generateAs(
      ctx,
      () => ({
        apiKey: () => ctx.env.UTHANA_API_KEY,
        characterId: () => ctx.env.UTHANA_CHARACTER_ID,
        http: ctx.http,
        withTx: (body) => ctx.withTx(body),
      }),
      job,
    );
    return {};
  },
);
