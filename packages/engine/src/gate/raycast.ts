import type { Vec3 } from "../types";
import type { SceneGeom } from "../types";

export type RayHit = {
  meshId: string;
  /** Fraction along the segment, 0 at `a` and 1 at `b`. */
  t: number;
  point: Vec3;
  /** Triangle index within the mesh. */
  triangle: number;
  /** True when the ray met the triangle from behind (against its winding). */
  backface: boolean;
};

const DET_EPS = 1e-12;
const BARY_EPS = 1e-9;
const T_EPS = 1e-9;

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

/**
 * Möller–Trumbore. Double-sided: a triangle is hit from either side, and
 * `backface` says which. Points on an edge or vertex count as hits, so a ray
 * through the seam of two triangles cannot slip between them. Returns the ray
 * parameter t (point = origin + t * dir) or null.
 */
export function rayTriangle(
  origin: Vec3,
  dir: Vec3,
  v0: Vec3,
  v1: Vec3,
  v2: Vec3,
): { t: number; backface: boolean } | null {
  const e1 = sub(v1, v0);
  const e2 = sub(v2, v0);
  const p = cross(dir, e2);
  const det = dot(e1, p);
  if (Math.abs(det) < DET_EPS) return null; // parallel to the triangle plane
  const inv = 1 / det;
  const s = sub(origin, v0);
  const u = dot(s, p) * inv;
  if (u < -BARY_EPS || u > 1 + BARY_EPS) return null;
  const q = cross(s, e1);
  const v = dot(dir, q) * inv;
  if (v < -BARY_EPS || u + v > 1 + BARY_EPS) return null;
  return { t: dot(e2, q) * inv, backface: det < 0 };
}

/**
 * First mesh triangle crossed by the segment a -> b, or null. Hits within
 * 1e-9 of either end do not count, so a target resting on a surface is not
 * blocked by that surface.
 */
export function segmentBlocked(a: Vec3, b: Vec3, geom: SceneGeom): RayHit | null {
  const dir = sub(b, a);
  if (dot(dir, dir) === 0) return null;
  let best: RayHit | null = null;
  for (const mesh of geom.meshes) {
    const { positions, indices } = mesh;
    const vert = (i: number): Vec3 => [
      positions[3 * i]!,
      positions[3 * i + 1]!,
      positions[3 * i + 2]!,
    ];
    for (let k = 0; k + 2 < indices.length; k += 3) {
      const hit = rayTriangle(a, dir, vert(indices[k]!), vert(indices[k + 1]!), vert(indices[k + 2]!));
      if (!hit || hit.t < T_EPS || hit.t > 1 - T_EPS) continue;
      if (best && hit.t >= best.t) continue;
      best = {
        meshId: mesh.id,
        t: hit.t,
        point: [a[0] + dir[0] * hit.t, a[1] + dir[1] * hit.t, a[2] + dir[2] * hit.t],
        triangle: k / 3,
        backface: hit.backface,
      };
    }
  }
  return best;
}
