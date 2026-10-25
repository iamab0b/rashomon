import type { Action } from "@rashomon/schema";
import { RUN_MAX_MS, WALK_MAX_MS } from "../gate/timeDistance";

export const WALK_SPEED_MS = 1.4;
export const RUN_SPEED_MS = 4;

const FIXED_DURATION_S: Record<Exclude<Action, "walk" | "run">, number> = {
  stand: 2,
  look: 2,
  speak: 2,
  crouch: 2,
  shove: 1,
  fall: 1,
  pick_up: 1,
  drop: 1,
  punch: 1,
  throw: 1,
  open_door: 1,
  hands_up: 1.5,
  point: 1.5,
  reach: 1.5,
  jump: 1.5,
  dodge: 1.5,
  kneel: 2,
  stumble: 2,
  drink: 3,
  phone: 4,
};

export function durationFor(action: Action, distanceM: number): number {
  if (action === "walk") return distanceM / WALK_SPEED_MS;
  if (action === "run") return distanceM / RUN_SPEED_MS;
  return FIXED_DURATION_S[action];
}

export type Interval = { tStart: number; tEnd: number; tInferred: boolean };

export type StatedBounds = { floor: number; ceiling: number; reserveS: number; overlapped: boolean };

const MIN_SPEED_MS: Partial<Record<Action, number>> = { walk: WALK_SPEED_MS, run: RUN_SPEED_MS };
const MAX_SPEED_MS: Partial<Record<Action, number>> = { walk: WALK_MAX_MS, run: RUN_MAX_MS };

export function realisticMovement(
  interval: Interval,
  action: Action,
  pathLengthM: number,
  bounds: StatedBounds,
): Interval {
  const speed = MIN_SPEED_MS[action];
  const limit = MAX_SPEED_MS[action];
  if (speed === undefined || limit === undefined || pathLengthM <= 0) return interval;
  const needed = pathLengthM / speed;
  let { tStart, tEnd } = interval;
  if (tEnd - tStart < needed && !bounds.overlapped) {
    const reserved = bounds.ceiling - bounds.reserveS;
    tEnd = Math.max(tEnd, Math.min(tStart + needed, reserved));
    const missing = needed - (tEnd - tStart);
    if (missing > 0) tStart = Math.min(tStart, Math.max(bounds.floor, tStart - missing));
  }
  const changed = tStart !== interval.tStart || tEnd !== interval.tEnd;
  const seconds = tEnd - tStart;
  const tooFast = seconds <= 0 || pathLengthM / seconds > limit;
  return { tStart, tEnd, tInferred: interval.tInferred || changed || tooFast };
}

export const hasInterval = (t: unknown): t is [number, number] =>
  Array.isArray(t) &&
  t.length === 2 &&
  Number.isFinite(t[0]) &&
  Number.isFinite(t[1]);

export function resolveInterval(
  t: unknown,
  action: Action,
  distanceM: number,
  previousEnd: number,
): { tStart: number; tEnd: number; tInferred: boolean } {
  if (hasInterval(t)) return { tStart: t[0], tEnd: t[1], tInferred: false };
  return {
    tStart: previousEnd,
    tEnd: previousEnd + durationFor(action, distanceM),
    tInferred: true,
  };
}
