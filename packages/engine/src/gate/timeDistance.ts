import type { FlagDraft, ResolvedEvent, ResolvedGraph } from "../types";
import { dist, endPoint, startPoint } from "./positions";

export const WALK_MAX_MS = 2;
export const RUN_MAX_MS = 6;
export const ANY_MAX_MS = 8;
export const MIN_GAP_S = 0.1;

function limitExceeded(action: string, speed: number, ownMovement: boolean): number | null {
  if (speed > ANY_MAX_MS) return ANY_MAX_MS;
  if (!ownMovement) return null;
  if (action === "walk" && speed > WALK_MAX_MS) return WALK_MAX_MS;
  if (action === "run" && speed > RUN_MAX_MS) return RUN_MAX_MS;
  return null;
}

export function timeDistanceFlags(resolved: ResolvedGraph): FlagDraft[] {
  const flags: FlagDraft[] = [];
  const push = (
    e: ResolvedEvent,
    meters: number,
    seconds: number,
    lead: string,
    between: string,
    ownMovement: boolean,
    extra: Record<string, string> = {},
  ) => {
    const speed = meters / seconds;
    const limit = limitExceeded(e.action, speed, ownMovement);
    if (limit === null) return;
    flags.push({
      eventId: e.id,
      check: "time_distance",
      severity: e.tInferred ? "soft" : "hard",
      detail: `${lead} ${meters.toFixed(1)} m${between} in ${seconds.toFixed(1)} s, ${speed.toFixed(1)} m/s, over the ${limit.toFixed(1)} m/s limit.`,
      evidence: {
        distanceM: Number(meters.toFixed(2)),
        durationS: Number(seconds.toFixed(2)),
        speedMS: Number(speed.toFixed(2)),
        limitMS: limit,
        ...extra,
      },
      suggestedQuestion: `That is about ${meters.toFixed(1)} m in ${seconds.toFixed(1)} s. Did it feel faster than a normal walk, or did it take longer than that?`,
    });
  };

  const actors = [...new Set(resolved.events.map((e) => e.actor))];
  for (const actor of actors) {
    const mine = resolved.events
      .filter((e) => e.actor === actor && e.status !== "superseded")
      .sort((a, b) => a.tStart - b.tStart || a.tEnd - b.tEnd);
    for (const e of mine) {
      if ((e.action === "walk" || e.action === "run") && e.pathLengthM > 0) {
        const seconds = e.tEnd - e.tStart;
        push(e, e.pathLengthM, seconds > 0 ? seconds : MIN_GAP_S, `${e.actor} covers`, "", true);
      }
      const to = startPoint(e);
      if (!to) continue;
      let prev: ResolvedEvent | undefined;
      for (const c of mine) {
        if (c === e || c.tEnd > e.tStart || !endPoint(c)) continue;
        if (!prev || c.tEnd >= prev.tEnd) prev = c;
      }
      if (!prev) continue;
      const from = endPoint(prev)!;
      const meters = dist(from, to);
      if (meters === 0) continue;
      const gap = e.tStart - prev.tEnd;
      push(
        e,
        meters,
        gap > 0 ? gap : MIN_GAP_S,
        `${e.actor} would have to cover`,
        ` between ${prev.id} and ${e.id}`,
        false,
        { previousEventId: prev.id },
      );
    }
  }
  return flags;
}
