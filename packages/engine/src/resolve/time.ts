import type { Action } from "@rashomon/schema";

export const WALK_SPEED_MS = 1.4;
export const RUN_SPEED_MS = 4;

/** Fixed durations (seconds) for actions that are not distance-driven. */
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
};

export function durationFor(action: Action, distanceM: number): number {
  if (action === "walk") return distanceM / WALK_SPEED_MS;
  if (action === "run") return distanceM / RUN_SPEED_MS;
  return FIXED_DURATION_S[action];
}

export const hasInterval = (t: unknown): t is [number, number] =>
  Array.isArray(t) &&
  t.length === 2 &&
  Number.isFinite(t[0]) &&
  Number.isFinite(t[1]);

/**
 * Seconds for one event. A given interval is kept as is; otherwise the event
 * starts when the previous one ended (0 for the first) and lasts as long as
 * the action table says.
 */
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
