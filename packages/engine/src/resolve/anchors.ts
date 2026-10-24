import type { Anchor, Landmark, SceneManifest } from "@rashomon/schema";
import type { Vec3 } from "../types";

/** The schema's Anchor plus `behind`, which only the resolver understands. */
export type ResolverAnchor = Anchor | { kind: "behind"; landmark: string };

export const NEAR_OFFSET_M = 0.6;

type Bounds = { min: Vec3; max: Vec3 };

function landmarkOf(id: string, manifest: SceneManifest): Landmark {
  const lm = manifest.landmarks.find((l) => l.id === id);
  if (!lm) throw new Error(`unknown landmark id: ${id}`);
  return lm;
}

/** Interior footprint: the manifest's `interior` when present, else the union of landmark boxes. */
function interiorOf(manifest: SceneManifest): Bounds {
  const declared = (manifest as { interior?: Bounds }).interior;
  if (declared) return declared;
  const min: Vec3 = [Infinity, 0, Infinity];
  const max: Vec3 = [-Infinity, 0, -Infinity];
  for (const l of manifest.landmarks) {
    for (const i of [0, 2] as const) {
      min[i] = Math.min(min[i], l.bounds.min[i]);
      max[i] = Math.max(max[i], l.bounds.max[i]);
    }
  }
  return { min, max };
}

export function roomCenter(manifest: SceneManifest): Vec3 {
  const { min, max } = interiorOf(manifest);
  return [(min[0] + max[0]) / 2, 0, (min[2] + max[2]) / 2];
}

const floorCenter = (b: Bounds): Vec3 => [
  (b.min[0] + b.max[0]) / 2,
  0,
  (b.min[2] + b.max[2]) / 2,
];

/**
 * Point `offset` meters outside the box face that faces the room center
 * (sign = 1) or the face away from it (sign = -1), centered on that face.
 */
function offsetFromFace(
  b: Bounds,
  manifest: SceneManifest,
  offset: number,
  sign: 1 | -1,
): Vec3 {
  const c = floorCenter(b);
  const room = roomCenter(manifest);
  const half = [(b.max[0] - b.min[0]) / 2, (b.max[2] - b.min[2]) / 2];
  const dx = room[0] - c[0];
  const dz = room[2] - c[2];
  // Compare in units of half-extent so a long thin box picks its long side.
  const alongX = Math.abs(dx) / (half[0] || 1e-9) >= Math.abs(dz) / (half[1] || 1e-9);
  const p: Vec3 = [c[0], 0, c[2]];
  if (alongX) {
    const dir = Math.sign(dx) * sign || sign;
    p[0] = dir > 0 ? b.max[0] + offset : b.min[0] - offset;
  } else {
    const dir = Math.sign(dz) * sign || sign;
    p[2] = dir > 0 ? b.max[2] + offset : b.min[2] - offset;
  }
  return p;
}

function clampToInterior(p: Vec3, manifest: SceneManifest): Vec3 {
  const { min, max } = interiorOf(manifest);
  return [
    Math.min(Math.max(p[0], min[0]), max[0]),
    0,
    Math.min(Math.max(p[2], min[2]), max[2]),
  ];
}

/** World point (y = 0) for an anchor. Throws on an unknown landmark id. */
export function anchorToPoint(
  anchor: ResolverAnchor,
  manifest: SceneManifest,
): Vec3 {
  switch (anchor.kind) {
    case "at":
      return floorCenter(landmarkOf(anchor.landmark, manifest).bounds);
    case "near": {
      const lm = landmarkOf(anchor.landmark, manifest);
      return offsetFromFace(lm.bounds, manifest, anchor.radiusM ?? NEAR_OFFSET_M, 1);
    }
    case "behind": {
      const lm = landmarkOf(anchor.landmark, manifest);
      return clampToInterior(
        offsetFromFace(lm.bounds, manifest, NEAR_OFFSET_M, -1),
        manifest,
      );
    }
    case "between": {
      const a = floorCenter(landmarkOf(anchor.a, manifest).bounds);
      const b = floorCenter(landmarkOf(anchor.b, manifest).bounds);
      return [(a[0] + b[0]) / 2, 0, (a[2] + b[2]) / 2];
    }
    case "xyz":
      return [anchor.position[0], 0, anchor.position[2]];
  }
}
