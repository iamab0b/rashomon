import type { ResolvedEvent, ResolvedGraph } from "@rashomon/engine";
import { ACTOR_BODIES, type Action, type ActionStyle, type ActorBody } from "@rashomon/schema";
import { ACTION_MAP, chooseClip, type ActionClipName } from "./actionMap";
import { isActorBody } from "./bodies";
import type { Rig } from "./rigs";

export type DebugActor = {
  id: string;
  rig: Rig;
  body?: ActorBody;
  position: readonly [number, number, number];
};

export const RIG_DEBUG_ACTORS: readonly DebugActor[] = [
  { id: "debug_ybot", rig: "mixamo_ybot", position: [3, 0, 3] },
  { id: "debug_xbot", rig: "mixamo_xbot", position: [5, 0, 3] },
];

function debugEvent(
  id: string,
  actor: string,
  action: Action,
  tStart: number,
  tEnd: number,
  style?: ActionStyle,
): ResolvedEvent {
  return {
    ...(style ? { style } : {}),
    id,
    witnessId: "w1",
    actor,
    action,
    tStart,
    tEnd,
    status: "plausible",
    flags: [],
    path: [],
    pathLengthM: 0,
    reachable: true,
    sources: [`utt_${id}`],
    tInferred: false,
  };
}

export type RigDebugClip = {
  readonly clip: ActionClipName;
  readonly action: Action;
  readonly style?: ActionStyle;
  readonly tStart: number;
  readonly tEnd: number;
};

export const RIG_DEBUG_NEW_CLIPS: readonly RigDebugClip[] = [
  { clip: "clip_hands_up", action: "hands_up", tStart: 12, tEnd: 14.5 },
  { clip: "clip_pointing", action: "point", tStart: 15, tEnd: 17.5 },
  { clip: "clip_reach", action: "reach", tStart: 18, tEnd: 20.5 },
  { clip: "clip_throw", action: "throw", tStart: 21, tEnd: 23.5 },
  { clip: "clip_kneel", action: "kneel", tStart: 24, tEnd: 26.5 },
  { clip: "clip_sneak", action: "walk", style: "sneak", tStart: 27, tEnd: 29.5 },
  { clip: "clip_stumble_back", action: "stumble", tStart: 30, tEnd: 32.5 },
  { clip: "clip_fall_forward", action: "fall", style: "forward", tStart: 33, tEnd: 35.5 },
  { clip: "clip_run_scared", action: "run", style: "scared", tStart: 36, tEnd: 38.5 },
  { clip: "clip_jump_over", action: "jump", tStart: 39, tEnd: 41.5 },
  { clip: "clip_phone", action: "phone", tStart: 42, tEnd: 44.5 },
  { clip: "clip_open_door_out", action: "open_door", style: "outward", tStart: 45, tEnd: 47.5 },
  { clip: "clip_drink", action: "drink", tStart: 48, tEnd: 50.5 },
  { clip: "clip_look_behind", action: "look", style: "behind", tStart: 51, tEnd: 53.5 },
  { clip: "clip_dodge", action: "dodge", tStart: 54, tEnd: 56.5 },
];

export type RigDebugClipLine = RigDebugClip & {
  readonly eventId: string;
  readonly plays: string;
};

const newClipEvents: readonly ResolvedEvent[] = RIG_DEBUG_NEW_CLIPS.map((entry, index) =>
  debugEvent(`n${index + 1}`, "debug_ybot", entry.action, entry.tStart, entry.tEnd, entry.style),
);

export function rigDebugClipLines(hasClip: (name: string) => boolean): readonly RigDebugClipLine[] {
  return RIG_DEBUG_NEW_CLIPS.map((entry, index) => ({
    ...entry,
    eventId: newClipEvents[index]!.id,
    plays: chooseClip(ACTION_MAP[entry.action], hasClip, entry.style),
  }));
}

const RIG_DEBUG_DURATION_S = 57;
const BODY_PARAM = "body";
const BODY_FILE_PREFIX = "body_";
const ALL_BODIES = "all";
const SINGLE_BODY_POSITION = [7, 0, 3] as const;
const BODY_ROW_POSITIONS: readonly (readonly [number, number, number])[] = [
  [1.5, 0, 5],
  [2.8, 0, 5],
  [4.1, 0, 5],
  [5.4, 0, 5],
  [6.7, 0, 5],
  [8, 0, 5],
];

export type RigDebugBodies = { readonly bodies: readonly ActorBody[]; readonly unknown?: string };

export function rigDebugBodies(search: string): RigDebugBodies {
  const raw = new URLSearchParams(search).get(BODY_PARAM);
  if (raw === null || raw === "") return { bodies: [] };
  if (raw === ALL_BODIES) return { bodies: ACTOR_BODIES };
  const name = raw.startsWith(BODY_FILE_PREFIX) ? raw.slice(BODY_FILE_PREFIX.length) : raw;
  return isActorBody(name) ? { bodies: [name] } : { bodies: [], unknown: raw };
}

export function rigDebugActors(bodies: readonly ActorBody[]): readonly DebugActor[] {
  return [
    ...RIG_DEBUG_ACTORS,
    ...bodies.map(
      (body, index): DebugActor => ({
        id: `debug_${body}`,
        rig: "mixamo_ybot",
        body,
        position: bodies.length === 1 ? SINGLE_BODY_POSITION : BODY_ROW_POSITIONS[index] ?? SINGLE_BODY_POSITION,
      }),
    ),
  ];
}

export function rigDebugGraph(bodies: readonly ActorBody[]): ResolvedGraph {
  return {
    sceneId: "rig_debug",
    version: 1,
    durationS: RIG_DEBUG_DURATION_S,
    actors: rigDebugActors(bodies).map((actor) => ({ id: actor.id, label: actor.id, role: "other", rig: actor.rig })),
    events: [
      debugEvent("d1", "debug_ybot", "walk", 0, 6),
      debugEvent("d2", "debug_ybot", "fall", 6, 8),
      debugEvent("d3", "debug_xbot", "walk", 0, 6),
      debugEvent("d4", "debug_xbot", "speak", 6, 12),
      ...newClipEvents,
      ...bodies.map((body) => debugEvent(`b_${body}`, `debug_${body}`, "stand", 0, RIG_DEBUG_DURATION_S)),
    ],
    props: [],
  };
}

export const RIG_DEBUG_GRAPH: ResolvedGraph = rigDebugGraph([]);
