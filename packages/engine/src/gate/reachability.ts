import type { SceneManifest } from "@rashomon/schema";
import type { FlagDraft, ResolvedGraph, Vec3 } from "../types";
import { actorLabel, landmarkLabel, nearestLabel, nearestLandmarks } from "./labels";
import { blockersFor } from "./occluders";
import { segmentBlocked } from "./raycast";

const WAIST_HEIGHT_M = 0.5;

function blockerOnLine(from: Vec3, to: Vec3, manifest: SceneManifest): string {
  const lift = (p: Vec3): Vec3 => [p[0], WAIST_HEIGHT_M, p[2]];
  const hit = segmentBlocked(lift(from), lift(to), blockersFor({ meshes: [] }, manifest, []));
  if (hit) return landmarkLabel(hit.meshId, manifest);
  const mid: Vec3 = [(from[0] + to[0]) / 2, 0, (from[2] + to[2]) / 2];
  const occluders = nearestLandmarks(mid, manifest, manifest.landmarks.length).filter((l) => l.occludes);
  return occluders[0]?.label ?? "furniture";
}

export function reachabilityFlags(resolved: ResolvedGraph, manifest: SceneManifest): FlagDraft[] {
  const flags: FlagDraft[] = [];
  for (const e of resolved.events) {
    if (e.status === "superseded") continue;
    if ((e.action !== "walk" && e.action !== "run") || e.reachable) continue;
    const who = actorLabel(resolved, e.actor);
    if (!e.from || !e.to) {
      flags.push({
        eventId: e.id,
        check: "reachability",
        severity: "hard",
        detail: `${e.actor} has no walkable route for ${e.id}, which is missing 1 or more endpoints.`,
        evidence: { missingEndpoints: Number(!e.from) + Number(!e.to) },
        suggestedQuestion: `Where did ${who} start and where did they end up?`,
      });
      continue;
    }
    const straight = Math.hypot(e.to[0] - e.from[0], e.to[2] - e.from[2]);
    const blocker = blockerOnLine(e.from, e.to, manifest);
    flags.push({
      eventId: e.id,
      check: "reachability",
      severity: "hard",
      detail: `${e.actor} has no walkable route from (${e.from[0].toFixed(1)}, ${e.from[2].toFixed(1)}) to (${e.to[0].toFixed(1)}, ${e.to[2].toFixed(1)}), ${straight.toFixed(1)} m apart in a straight line.`,
      evidence: { distanceM: Number(straight.toFixed(2)), blocker },
      suggestedQuestion: `The way from the ${nearestLabel(e.from, manifest)} to the ${nearestLabel(e.to, manifest)} runs through the ${blocker}. Was it open, or did they go another way?`,
    });
  }
  return flags;
}
