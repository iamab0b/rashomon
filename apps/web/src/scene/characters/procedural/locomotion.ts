import type { ResolvedEvent } from "@rashomon/engine";
import type { KeyframeTrack } from "three";
import { eventFraction } from "../../playback/paths";
import type { ClipTimeOverride } from "../blend";

export const LOCOMOTION_ACTIONS: ReadonlySet<string> = new Set(["walk", "run"]);
const VECTOR3_STRIDE = 3;
const MIN_CYCLE_DISTANCE_M = 0.1;

export type CycleDistanceLookup = (clip: string) => number | undefined;

type PathTimedEvent = Pick<ResolvedEvent, "pathLengthM" | "tStart" | "tEnd">;

export function measureCycleDistance(hipsPosition: KeyframeTrack | undefined, unitScale: number): number | undefined {
  if (!hipsPosition || hipsPosition.values.length < 2 * VECTOR3_STRIDE) return undefined;
  const values = hipsPosition.values;
  const last = values.length - VECTOR3_STRIDE;
  const dx = (values[last] ?? 0) - (values[0] ?? 0);
  const dz = (values[last + 2] ?? 0) - (values[2] ?? 0);
  const distance = Math.hypot(dx, dz) * unitScale;
  return distance >= MIN_CYCLE_DISTANCE_M ? distance : undefined;
}

export function distanceAlongPath(event: PathTimedEvent, t: number): number {
  return event.pathLengthM * eventFraction(event, t);
}

export function locomotionClipTime(distanceM: number, cycleDistanceM: number, clipLength: number): number {
  const cycles = distanceM / cycleDistanceM;
  return (cycles - Math.floor(cycles)) * clipLength;
}

function movesAlongPath(event: ResolvedEvent): boolean {
  return LOCOMOTION_ACTIONS.has(event.action) && event.reachable && event.pathLengthM > 0;
}

export function locomotionTimer(events: readonly ResolvedEvent[], cycleDistanceOf: CycleDistanceLookup): ClipTimeOverride {
  const moving = new Map(events.filter(movesAlongPath).map((event) => [event.id, event] as const));
  return (window, t, duration) => {
    const event = moving.get(window.source);
    const cycle = event ? cycleDistanceOf(window.clip) : undefined;
    if (!event || !cycle) return undefined;
    return locomotionClipTime(distanceAlongPath(event, t), cycle, duration);
  };
}
