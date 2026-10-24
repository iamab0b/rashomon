import type { Anchor, EventGraph, SceneManifest } from "@rashomon/schema";
import type { ResolvedEvent, ResolvedGraph, Vec3 } from "../types";
import type { GeomMesh, SceneGeom } from "./types";

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

type Landmarks = SceneManifest["landmarks"];

/** Stand-in for the resolver (separate PR): `at` = landmark position, `near` = 0.6 m off the box face toward (4.5, 3.5). */
function anchorPoint(a: Anchor, landmarks: Landmarks): Vec3 {
  const lm = (id: string) => landmarks.find((l) => l.id === id)!;
  if (a.kind === "at") {
    const p = lm(a.landmark).position;
    return [p[0], 0, p[2]];
  }
  if (a.kind === "near") {
    const { min, max } = lm(a.landmark).bounds;
    const r = a.radiusM ?? 0.6;
    const cx = (min[0] + max[0]) / 2;
    const cz = (min[2] + max[2]) / 2;
    const dx = 4.5 - cx;
    const dz = 3.5 - cz;
    if (Math.abs(dx) / ((max[0] - min[0]) / 2) >= Math.abs(dz) / ((max[2] - min[2]) / 2))
      return [dx > 0 ? max[0] + r : min[0] - r, 0, cz];
    return [cx, 0, dz > 0 ? max[2] + r : min[2] - r];
  }
  if (a.kind === "xyz") return [a.position[0], 0, a.position[2]];
  throw new Error(`test helper does not resolve ${a.kind}`);
}

/** Straight-line stand-in resolver: enough to feed the gate real fixture positions and times. */
export function resolveForTest(graph: EventGraph, manifest: SceneManifest): ResolvedGraph {
  const events: ResolvedEvent[] = graph.events.map((e) => {
    const move = e.action === "walk" || e.action === "run";
    const from = e.from && anchorPoint(e.from, manifest.landmarks);
    const to = e.to && anchorPoint(e.to, manifest.landmarks);
    const at = e.at && anchorPoint(e.at, manifest.landmarks);
    const path = move && from && to ? [from, to] : [];
    return {
      id: e.id,
      actor: e.actor,
      action: e.action,
      tStart: e.t[0],
      tEnd: e.t[1],
      status: e.status,
      flags: [],
      path,
      pathLengthM: path.length === 2 ? Math.hypot(to![0] - from![0], to![2] - from![2]) : 0,
      ...(move && from ? { from } : {}),
      ...(move && to ? { to } : {}),
      ...(at ? { at } : {}),
      ...(e.target ? { target: e.target } : {}),
      tInferred: false,
    };
  });
  return {
    sceneId: graph.sceneId,
    version: graph.version,
    durationS: Math.max(...events.map((e) => e.tEnd)),
    actors: graph.actors.map((a) => ({ id: a.id, label: a.label, role: a.role, rig: a.rig })),
    events,
    props: [],
  };
}

export const ev = (over: Partial<ResolvedEvent> & { id: string }): ResolvedEvent => ({
  actor: "a",
  action: "stand",
  tStart: 0,
  tEnd: 1,
  status: "proposed",
  flags: [],
  path: [],
  pathLengthM: 0,
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
