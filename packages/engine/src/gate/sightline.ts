import type { SceneManifest } from "@rashomon/schema";
import type { FlagDraft, ResolvedGraph, SceneGeom, Vec3 } from "../types";
import { actorLabel, landmarkLabel, nearestLabel } from "./labels";
import { blockersFor } from "./occluders";
import { actorPositionAt, movementCover } from "./positions";
import { segmentBlocked } from "./raycast";

export const EYE_HEIGHT_M = 1.6;
export const CHEST_HEIGHT_M = 1.2;
export const HEAD_HEIGHT_M = 1.6;

export function sightlineFlags(
  resolved: ResolvedGraph,
  manifest: SceneManifest,
  geom: SceneGeom,
): FlagDraft[] {
  const flags: FlagDraft[] = [];
  for (const e of resolved.events) {
    if (e.action !== "look" || !e.target || e.status === "superseded") continue;
    if (e.target === e.actor || !resolved.actors.some((a) => a.id === e.target)) continue;
    const t = (e.tStart + e.tEnd) / 2;
    const moving = movementCover(resolved.events, e.actor, t);
    const observer = moving ? moving.position : (e.at ?? actorPositionAt(resolved.events, e.actor, t));
    const target = actorPositionAt(resolved.events, e.target, t);
    if (!observer || !target) continue;
    const eye: Vec3 = [observer[0], observer[1] + EYE_HEIGHT_M, observer[2]];
    const chest: Vec3 = [target[0], target[1] + CHEST_HEIGHT_M, target[2]];
    const head: Vec3 = [target[0], target[1] + HEAD_HEIGHT_M, target[2]];
    const blockers = blockersFor(geom, manifest, [observer, target]);
    const chestHit = segmentBlocked(eye, chest, blockers);
    const headHit = segmentBlocked(eye, head, blockers);
    if (!chestHit || !headHit) continue;
    const length = Math.hypot(chest[0] - eye[0], chest[1] - eye[1], chest[2] - eye[2]);
    const blockerM = chestHit.t * length;
    flags.push({
      eventId: e.id,
      check: "sightline",
      severity: "hard",
      detail:
        `${e.actor} at (${observer[0].toFixed(1)}, ${observer[2].toFixed(1)}) cannot see ${e.target} at ` +
        `(${target[0].toFixed(1)}, ${target[2].toFixed(1)}) at t=${t.toFixed(1)}s: ` +
        `${chestHit.meshId} blocks both the chest and head rays, ${blockerM.toFixed(1)} m along a ${length.toFixed(1)} m line.`,
      evidence: {
        blocker: chestHit.meshId,
        blockerDistanceM: Number(blockerM.toFixed(2)),
        rayLengthM: Number(length.toFixed(2)),
        atTimeS: Number(t.toFixed(2)),
      },
      suggestedQuestion:
        `From the ${nearestLabel(observer, manifest)}, the ${landmarkLabel(chestHit.meshId, manifest)} ` +
        `would be between you and the ${actorLabel(resolved, e.target)}. Where exactly were you standing when you saw that?`,
    });
  }
  return flags;
}
