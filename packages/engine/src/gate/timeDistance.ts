import type { ResolvedEvent, ResolvedGraph } from "../types";
import { dist, endPoint, startPoint } from "./positions";
import type { Flag } from "./types";

export const WALK_MAX_MS = 2;
export const RUN_MAX_MS = 6;
export const ANY_MAX_MS = 8;
/** Gap used when two consecutive events touch (zero seconds apart). */
export const MIN_GAP_S = 0.1;

function classify(action: string, speed: number): "hard" | "soft" | null {
  if (speed > ANY_MAX_MS) return "hard";
  if (action === "walk" && speed > WALK_MAX_MS) return "soft";
  if (action === "run" && speed > RUN_MAX_MS) return "soft";
  return null;
}

const limitFor = (action: string, severity: "hard" | "soft"): number =>
  severity === "hard" ? ANY_MAX_MS : action === "walk" ? WALK_MAX_MS : RUN_MAX_MS;

/**
 * Per actor, in time order: each movement event's own path length over its
 * duration, and the straight-line jump from one event's end to the next
 * event's start over the gap between them. Overlapping events are skipped
 * here; the contradiction rule covers those.
 */
export function timeDistanceFlags(resolved: ResolvedGraph): Flag[] {
  const flags: Flag[] = [];
  const speedFlag = (
    e: ResolvedEvent,
    ids: string[],
    meters: number,
    seconds: number,
    what: string,
  ) => {
    const speed = meters / seconds;
    const severity = classify(e.action, speed);
    if (!severity) return;
    flags.push({
      kind: "time_distance",
      severity,
      eventIds: ids,
      message: `${e.actor} ${what} ${meters.toFixed(1)} m in ${seconds.toFixed(1)} s, ${speed.toFixed(1)} m/s, over the ${limitFor(e.action, severity)} m/s ${severity === "hard" ? "limit for any movement" : `${e.action} limit`}.`,
    });
  };

  const actors = [...new Set(resolved.events.map((e) => e.actor))];
  for (const actor of actors) {
    const mine = resolved.events
      .filter((e) => e.actor === actor && e.status !== "superseded")
      .sort((a, b) => a.tStart - b.tStart || a.tEnd - b.tEnd);
    for (let i = 0; i < mine.length; i++) {
      const e = mine[i]!;
      if ((e.action === "walk" || e.action === "run") && e.pathLengthM > 0) {
        const seconds = e.tEnd - e.tStart;
        speedFlag(e, [e.id], e.pathLengthM, seconds > 0 ? seconds : MIN_GAP_S, "covers");
      }
      const prev = mine[i - 1];
      if (!prev) continue;
      const from = endPoint(prev);
      const to = startPoint(e);
      const gap = e.tStart - prev.tEnd;
      if (!from || !to || gap < 0) continue;
      const meters = dist(from, to);
      if (meters === 0) continue;
      speedFlag(e, [prev.id, e.id], meters, gap > 0 ? gap : MIN_GAP_S, "jumps");
    }
  }
  return flags;
}
