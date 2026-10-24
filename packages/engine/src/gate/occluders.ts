import type { SceneManifest } from "@rashomon/schema";
import type { GeomMesh, SceneGeom, Vec3 } from "../types";

export function boxMesh(id: string, min: Vec3, max: Vec3): GeomMesh {
  const [x0, y0, z0] = min;
  const [x1, y1, z1] = max;
  return {
    id,
    positions: [
      x0, y0, z0, x1, y0, z0, x1, y1, z0, x0, y1, z0,
      x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1,
    ],
    indices: [
      0, 3, 2, 0, 2, 1,
      4, 5, 6, 4, 6, 7,
      0, 4, 7, 0, 7, 3,
      1, 2, 6, 1, 6, 5,
      0, 1, 5, 0, 5, 4,
      3, 7, 6, 3, 6, 2,
    ],
  };
}

export function blockersFor(
  geom: SceneGeom,
  manifest: SceneManifest,
  standingAt: Vec3[],
): SceneGeom {
  const standingIn = new Set(
    manifest.landmarks
      .filter((l) =>
        standingAt.some(
          (p) =>
            p[0] > l.bounds.min[0] &&
            p[0] < l.bounds.max[0] &&
            p[2] > l.bounds.min[2] &&
            p[2] < l.bounds.max[2],
        ),
      )
      .map((l) => l.id),
  );
  const meshIds = new Set(geom.meshes.map((m) => m.id));
  return {
    meshes: [
      ...geom.meshes.filter((m) => !standingIn.has(m.id)),
      ...manifest.landmarks
        .filter((l) => l.occludes && !standingIn.has(l.id) && !meshIds.has(l.id))
        .map((l) => boxMesh(l.id, l.bounds.min, l.bounds.max)),
    ],
  };
}
