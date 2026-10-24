import type { ResolvedGraph } from "../types";
import { actorPositionAt } from "./positions";
import { segmentBlocked } from "./raycast";
import type { GateFlag, SceneGeom } from "../types";

export const EYE_HEIGHT_M = 1.6;
export const CHEST_HEIGHT_M = 1.2;

/**
 * `look` is the only perception verb in the Action enum. A look event with a
 * target that is an actor is tested at the middle of its interval: eye of the
 * looker to chest of the target.
 */
export function sightlineFlags(resolved: ResolvedGraph, geom: SceneGeom): GateFlag[] {
  const flags: GateFlag[] = [];
  for (const e of resolved.events) {
    if (e.action !== "look" || !e.target || e.status === "superseded") continue;
    if (e.target === e.actor || !resolved.actors.some((a) => a.id === e.target)) continue;
    const t = (e.tStart + e.tEnd) / 2;
    const observer = e.at ?? actorPositionAt(resolved.events, e.actor, t);
    const target = actorPositionAt(resolved.events, e.target, t);
    if (!observer || !target) continue;
    const eye: [number, number, number] = [observer[0], observer[1] + EYE_HEIGHT_M, observer[2]];
    const chest: [number, number, number] = [target[0], target[1] + CHEST_HEIGHT_M, target[2]];
    const hit = segmentBlocked(eye, chest, geom);
    if (!hit) continue;
    const length = Math.hypot(chest[0] - eye[0], chest[1] - eye[1], chest[2] - eye[2]);
    flags.push({
      kind: "sightline",
      severity: "hard",
      eventIds: [e.id],
      message:
        `${e.actor} at (${observer[0].toFixed(1)}, ${observer[2].toFixed(1)}) cannot see ${e.target} at ` +
        `(${target[0].toFixed(1)}, ${target[2].toFixed(1)}) at t=${t.toFixed(1)}s: ` +
        `${hit.meshId} blocks the line of sight ${(hit.t * length).toFixed(1)} m along a ${length.toFixed(1)} m ray.`,
    });
  }
  return flags;
}
