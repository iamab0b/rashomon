import type { ResolvedEvent, ResolvedGraph, SceneGeom } from "../types";
import { boxMesh } from "./occluders";

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
  sources: [`utt_${over.id}`],
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
