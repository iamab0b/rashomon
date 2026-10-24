import type { ResolvedEvent, ResolvedGraph } from "@rashomon/engine";
import type { Action } from "@rashomon/schema";
import type { Rig } from "./rigs";

export type DebugActor = {
  id: string;
  rig: Rig;
  position: readonly [number, number, number];
};

export const RIG_DEBUG_ACTORS: readonly DebugActor[] = [
  { id: "debug_ybot", rig: "mixamo_ybot", position: [3, 0, 3] },
  { id: "debug_xbot", rig: "mixamo_xbot", position: [5, 0, 3] },
];

function debugEvent(id: string, actor: string, action: Action, tStart: number, tEnd: number): ResolvedEvent {
  return {
    id,
    actor,
    action,
    tStart,
    tEnd,
    status: "plausible",
    flags: [],
    path: [],
    pathLengthM: 0,
    reachable: true,
    tInferred: false,
  };
}

export const RIG_DEBUG_GRAPH: ResolvedGraph = {
  sceneId: "rig_debug",
  version: 1,
  durationS: 12,
  actors: RIG_DEBUG_ACTORS.map((actor) => ({ id: actor.id, label: actor.id, role: "other", rig: actor.rig })),
  events: [
    debugEvent("d1", "debug_ybot", "walk", 0, 6),
    debugEvent("d2", "debug_ybot", "fall", 6, 8),
    debugEvent("d3", "debug_xbot", "walk", 0, 6),
    debugEvent("d4", "debug_xbot", "speak", 6, 12),
  ],
  props: [],
};
