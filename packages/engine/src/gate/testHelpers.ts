import type { GeomMesh, ResolvedEvent, ResolvedGraph, SceneGeom, Vec3 } from "../types";

/** Closed box mesh, 12 triangles, outward winding. */
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
      0, 3, 2, 0, 2, 1, // -z
      4, 5, 6, 4, 6, 7, // +z
      0, 4, 7, 0, 7, 3, // -x
      1, 2, 6, 1, 6, 5, // +x
      0, 1, 5, 0, 5, 4, // -y
      3, 7, 6, 3, 6, 2, // +y
    ],
  };
}

/** The box model from docs/store-floorplan.md, "Geometry" table (obstacles only). */
export const floorPlanGeom = (): SceneGeom => ({
  meshes: [
    boxMesh("counter", [7.8, 0, 1.0], [8.4, 1.0, 4.0]),
    boxMesh("register", [7.9, 1.0, 1.6], [8.3, 1.3, 2.0]),
    boxMesh("shelf_a", [2.4, 0, 1.6], [3.4, 1.8, 5.0]),
    boxMesh("shelf_b", [5.0, 0, 2.0], [6.0, 1.8, 5.0]),
    boxMesh("cooler", [1.0, 0, 6.4], [8.0, 2.0, 7.0]),
  ],
});

export const ev = (over: Partial<ResolvedEvent> & { id: string }): ResolvedEvent => ({
  actor: "a",
  action: "stand",
  tStart: 0,
  tEnd: 1,
  status: "proposed",
  flags: [],
  path: [],
  pathLengthM: 0,
  reachable: true,
  tInferred: false,
  ...over,
});

export const graphOf = (events: ResolvedEvent[], actors = ["a", "b"]): ResolvedGraph => ({
  sceneId: "t",
  version: 1,
  durationS: Math.max(0, ...events.map((e) => e.tEnd)),
  actors: actors.map((id) => ({ id, label: id, role: "other", rig: "mixamo_ybot" })),
  events,
  props: [],
});
