import type { Portals } from "@rashomon/schema";
import type { Vec3 } from "../types";
import {
  MARGIN_M,
  expand,
  insideBox,
  segmentHitsBox,
  type Box,
  type Point2,
} from "./geometry";

type Waypoint = Portals["waypoints"][number];

const clearOf = (a: Point2, b: Point2, boxes: Box[]): boolean =>
  !boxes.some((box) => segmentHitsBox(a, b, box));

export function buildEdges(
  waypoints: Waypoint[],
  obstacles: Box[],
  margin = MARGIN_M,
): [string, string][] {
  const grown = obstacles.map((o) => expand(o, margin));
  const edges: [string, string][] = [];
  for (let i = 0; i < waypoints.length; i++) {
    for (let j = i + 1; j < waypoints.length; j++) {
      const a = waypoints[i]!;
      const b = waypoints[j]!;
      if (clearOf(a, b, grown)) edges.push([a.id, b.id]);
    }
  }
  return edges;
}

const dist = (a: Point2, b: Point2): number => Math.hypot(a.x - b.x, a.z - b.z);

function dropCollinear(pts: Point2[]): Point2[] {
  const out: Point2[] = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (last && dist(last, p) < 1e-9) continue;
    while (out.length >= 2) {
      const a = out[out.length - 2]!;
      const b = out[out.length - 1]!;
      const cross = (b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x);
      const dot = (b.x - a.x) * (p.x - b.x) + (b.z - a.z) * (p.z - b.z);
      if (Math.abs(cross) < 1e-9 && dot >= 0) out.pop();
      else break;
    }
    out.push(p);
  }
  return out;
}

const blockersBetween = (
  p: Point2,
  q: Point2,
  obstacles: Box[],
  margin: number,
): Box[] =>
  obstacles.flatMap((o) => {
    if (insideBox(p, o) || insideBox(q, o)) return [];
    const grown = expand(o, margin);
    return [insideBox(p, grown) || insideBox(q, grown) ? o : grown];
  });

export function straightLineClear(
  from: Vec3,
  to: Vec3,
  obstacles: Box[],
  margin = MARGIN_M,
): boolean {
  const p: Point2 = { x: from[0], z: from[2] };
  const q: Point2 = { x: to[0], z: to[2] };
  return clearOf(p, q, blockersBetween(p, q, obstacles, margin));
}

export function shortestPath(
  from: Vec3,
  to: Vec3,
  portals: Portals,
  obstacles: Box[],
  margin = MARGIN_M,
): Vec3[] | null {
  const start: Point2 = { x: from[0], z: from[2] };
  const goal: Point2 = { x: to[0], z: to[2] };
  const visibleFrom = (p: Point2, q: Point2): boolean =>
    clearOf(p, q, blockersBetween(p, q, obstacles, margin));

  const nodes: Point2[] = [start, goal, ...portals.waypoints];
  const idx = new Map<string, number>();
  portals.waypoints.forEach((w, i) => idx.set(w.id, i + 2));
  const adj: [number, number][][] = nodes.map(() => []);
  const link = (a: number, b: number) => {
    const w = dist(nodes[a]!, nodes[b]!);
    adj[a]!.push([b, w]);
    adj[b]!.push([a, w]);
  };
  for (const [a, b] of portals.edges) {
    const ia = idx.get(a);
    const ib = idx.get(b);
    if (ia === undefined || ib === undefined)
      throw new Error(`portal edge references unknown waypoint: ${a} - ${b}`);
    link(ia, ib);
  }
  for (let i = 2; i < nodes.length; i++) {
    if (visibleFrom(start, nodes[i]!)) link(0, i);
    if (visibleFrom(goal, nodes[i]!)) link(1, i);
  }
  if (visibleFrom(start, goal)) link(0, 1);

  const g = nodes.map(() => Infinity);
  const prev = nodes.map(() => -1);
  const closed = nodes.map(() => false);
  g[0] = 0;
  for (;;) {
    let cur = -1;
    let best = Infinity;
    for (let i = 0; i < nodes.length; i++) {
      if (closed[i]) continue;
      const f = g[i]! + dist(nodes[i]!, goal);
      if (f < best - 1e-12) {
        best = f;
        cur = i;
      }
    }
    if (cur < 0) return null;
    if (cur === 1) break;
    closed[cur] = true;
    for (const [n, w] of adj[cur]!) {
      if (g[cur]! + w < g[n]! - 1e-12) {
        g[n] = g[cur]! + w;
        prev[n] = cur;
      }
    }
  }

  const chain: Point2[] = [];
  for (let n = 1; n >= 0; n = prev[n]!) {
    chain.push(nodes[n]!);
    if (n === 0) break;
  }
  return dropCollinear(chain.reverse()).map((p): Vec3 => [p.x, 0, p.z]);
}

export const pathLength = (path: Vec3[]): number => {
  let sum = 0;
  for (let i = 1; i < path.length; i++)
    sum += Math.hypot(path[i]![0] - path[i - 1]![0], path[i]![2] - path[i - 1]![2]);
  return sum;
};
