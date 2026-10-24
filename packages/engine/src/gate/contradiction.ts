import type { SceneManifest } from "@rashomon/schema";
import type { ResolvedGraph, Vec3 } from "../types";
import { dist, eventPositionAt } from "./positions";
import type { GateFlag } from "../types";

export const CONTRADICTION_DISTANCE_M = 2;

function nearestLandmark(p: Vec3, manifest: SceneManifest): string {
  let best = "nowhere";
  let bestD = Infinity;
  for (const l of manifest.landmarks) {
    const dx = Math.max(l.bounds.min[0] - p[0], 0, p[0] - l.bounds.max[0]);
    const dz = Math.max(l.bounds.min[2] - p[2], 0, p[2] - l.bounds.max[2]);
    const d = Math.hypot(dx, dz);
    if (d < bestD - 1e-9) {
      bestD = d;
      best = l.id;
    }
  }
  return best;
}

/**
 * Same actor, two events whose intervals overlap, positioned more than 2 m
 * apart at the middle of the overlap. Events from the same source segment
 * are not compared with each other; events with no segment id are compared with all.
 */
export function contradictionFlags(resolved: ResolvedGraph, manifest: SceneManifest): GateFlag[] {
  const flags: GateFlag[] = [];
  const live = resolved.events.filter((e) => e.status !== "superseded");
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const a = live[i]!;
      const b = live[j]!;
      if (a.actor !== b.actor) continue;
      if (a.segmentId !== undefined && a.segmentId === b.segmentId) continue;
      const lo = Math.max(a.tStart, b.tStart);
      const hi = Math.min(a.tEnd, b.tEnd);
      if (hi - lo <= 0) continue;
      const t = (lo + hi) / 2;
      const pa = eventPositionAt(a, t);
      const pb = eventPositionAt(b, t);
      if (!pa || !pb) continue;
      const d = dist(pa, pb);
      if (d <= CONTRADICTION_DISTANCE_M) continue;
      flags.push({
        kind: "contradiction",
        severity: "soft",
        eventIds: [a.id, b.id],
        message: `${a.actor} is placed by ${nearestLandmark(pa, manifest)} (${a.id}) and by ${nearestLandmark(pb, manifest)} (${b.id}), ${d.toFixed(1)} m apart, at t=${t.toFixed(1)}s.`,
      });
    }
  }
  return flags;
}
