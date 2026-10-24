import type { Portals, SceneManifest } from "@rashomon/schema";
import type { ResolvedGraph, Vec3 } from "../types";
import type { GateFlag } from "../types";

type Box = { min: Vec3; max: Vec3 };
type P = { x: number; z: number };

export const MARGIN_M = 0.3;
const EPS = 1e-9;

const grow = (b: Box, m: number): Box => ({
  min: [b.min[0] - m, b.min[1], b.min[2] - m],
  max: [b.max[0] + m, b.max[1], b.max[2] + m],
});

const inside = (p: P, b: Box): boolean =>
  p.x > b.min[0] + EPS && p.x < b.max[0] - EPS && p.z > b.min[2] + EPS && p.z < b.max[2] - EPS;

/** Segment vs. the open interior of a floor-plan box (Liang-Barsky); touching is clear. */
function hits(a: P, b: P, box: Box): boolean {
  let t0 = 0;
  let t1 = 1;
  const d = [b.x - a.x, b.z - a.z];
  const o = [a.x, a.z];
  const lo = [box.min[0], box.min[2]];
  const hi = [box.max[0], box.max[2]];
  for (let i = 0; i < 2; i++) {
    if (Math.abs(d[i]!) < EPS) {
      if (o[i]! <= lo[i]! + EPS || o[i]! >= hi[i]! - EPS) return false;
      continue;
    }
    let ta = (lo[i]! - o[i]!) / d[i]!;
    let tb = (hi[i]! - o[i]!) / d[i]!;
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta);
    t1 = Math.min(t1, tb);
    if (t1 - t0 <= EPS) return false;
  }
  return t1 - t0 > EPS;
}

/** True when a walkable route exists between two floor points. */
export function hasRoute(a: Vec3, b: Vec3, portals: Portals, obstacles: Box[]): boolean {
  const pa: P = { x: a[0], z: a[2] };
  const pb: P = { x: b[0], z: b[2] };
  // An endpoint inside a solid obstacle has nowhere to stand.
  if (obstacles.some((o) => inside(pa, o) || inside(pb, o))) return false;
  const grown = obstacles.map((o) => grow(o, MARGIN_M));
  // An endpoint that is inside a clearance margin may still leave through it.
  const sees = (p: P, q: P) =>
    !grown.some((g) => !inside(p, g) && !inside(q, g) && hits(p, q, g));
  if (sees(pa, pb)) return true;

  const wp = new Map(portals.waypoints.map((w) => [w.id, w]));
  const adj = new Map<string, string[]>();
  for (const [x, y] of portals.edges) {
    if (!wp.has(x) || !wp.has(y)) continue;
    (adj.get(x) ?? adj.set(x, []).get(x)!).push(y);
    (adj.get(y) ?? adj.set(y, []).get(y)!).push(x);
  }
  const goal = new Set(portals.waypoints.filter((w) => sees(pb, w)).map((w) => w.id));
  const queue = portals.waypoints.filter((w) => sees(pa, w)).map((w) => w.id);
  const seen = new Set(queue);
  while (queue.length) {
    const id = queue.shift()!;
    if (goal.has(id)) return true;
    for (const n of adj.get(id) ?? [])
      if (!seen.has(n)) {
        seen.add(n);
        queue.push(n);
      }
  }
  return false;
}

/**
 * Hard flag for each event that cannot get from its `from` to its `to`: the
 * resolver marked it `reachable: false`, or its endpoints have no route
 * through the manifest's portals. Without a `portals` field only the
 * resolver's mark is used.
 */
export function reachabilityFlags(resolved: ResolvedGraph, manifest: SceneManifest): GateFlag[] {
  const portals = manifest.portals;
  const obstacles = manifest.landmarks.filter((l) => l.occludes).map((l) => l.bounds);
  const flags: GateFlag[] = [];
  for (const e of resolved.events) {
    if (e.status === "superseded") continue;
    const routed = portals && e.from && e.to ? hasRoute(e.from, e.to, portals, obstacles) : true;
    if (e.reachable !== false && routed) continue;
    const where =
      e.from && e.to
        ? `from (${e.from[0].toFixed(1)}, ${e.from[2].toFixed(1)}) to (${e.to[0].toFixed(1)}, ${e.to[2].toFixed(1)}), ${Math.hypot(e.to[0] - e.from[0], e.to[2] - e.from[2]).toFixed(1)} m apart in a straight line`
        : "between its endpoints";
    flags.push({
      kind: "reachability",
      severity: "hard",
      eventIds: [e.id],
      message: `${e.actor} has no walkable route ${where}, with furniture kept ${MARGIN_M} m clear.`,
    });
  }
  return flags;
}
