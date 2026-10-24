import type { Vec3 } from "../types";

export type Box = { min: Vec3; max: Vec3 };
export type Point2 = { x: number; z: number };

/** Clearance kept between a walking path and any obstacle box, meters. */
export const MARGIN_M = 0.3;

const EPS = 1e-9;

export const expand = (b: Box, m: number): Box => ({
  min: [b.min[0] - m, b.min[1], b.min[2] - m],
  max: [b.max[0] + m, b.max[1], b.max[2] + m],
});

/** True when p lies strictly inside the box on the floor plane (x, z). */
export function insideBox(p: Point2, b: Box): boolean {
  return (
    p.x > b.min[0] + EPS &&
    p.x < b.max[0] - EPS &&
    p.z > b.min[2] + EPS &&
    p.z < b.max[2] - EPS
  );
}

/**
 * True when the segment a-b passes through the open interior of the box on the
 * floor plane. Touching the boundary does not count (Liang-Barsky clip).
 */
export function segmentHitsBox(a: Point2, b: Point2, box: Box): boolean {
  let t0 = 0;
  let t1 = 1;
  const d = [b.x - a.x, b.z - a.z];
  const o = [a.x, a.z];
  const lo = [box.min[0], box.min[2]];
  const hi = [box.max[0], box.max[2]];
  for (let i = 0; i < 2; i++) {
    const di = d[i]!;
    const oi = o[i]!;
    if (Math.abs(di) < EPS) {
      if (oi <= lo[i]! + EPS || oi >= hi[i]! - EPS) return false;
      continue;
    }
    let ta = (lo[i]! - oi) / di;
    let tb = (hi[i]! - oi) / di;
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta);
    t1 = Math.min(t1, tb);
    if (t1 - t0 <= EPS) return false;
  }
  return t1 - t0 > EPS;
}
