import type { ResolvedEvent, ResolvedGraph } from "@rashomon/engine";
import type { Action, ActionStyle } from "@rashomon/schema";
import { ACTION_MAP, chooseClip, type ActionClipName } from "./actionMap";
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
};

export const RIG_DEBUG_NEW_CLIPS: readonly RigDebugClip[] = [
  { clip: "clip_hands_up", action: "hands_up" },
  { clip: "clip_pointing", action: "point" },
  { clip: "clip_reach", action: "reach" },
  { clip: "clip_throw", action: "throw" },
  { clip: "clip_kneel", action: "kneel" },
  { clip: "clip_sneak", action: "walk", style: "sneak" },
  { clip: "clip_stumble_back", action: "stumble" },
  { clip: "clip_fall_forward", action: "fall", style: "forward" },
  { clip: "clip_run_scared", action: "run", style: "scared" },
  { clip: "clip_jump_over", action: "jump" },
  { clip: "clip_phone", action: "phone" },
  { clip: "clip_open_door_out", action: "open_door", style: "outward" },
  { clip: "clip_drink", action: "drink" },
  { clip: "clip_look_behind", action: "look", style: "behind" },
  { clip: "clip_dodge", action: "dodge" },
];

const NEW_CLIPS_START_S = 12;
const NEW_CLIP_SLOT_S = 3;
const NEW_CLIP_PLAY_S = 2.5;

export type RigDebugClipLine = RigDebugClip & {
  readonly eventId: string;
  readonly tStart: number;
  readonly tEnd: number;
  readonly plays: string;
};

const newClipEvents: readonly ResolvedEvent[] = RIG_DEBUG_NEW_CLIPS.map((entry, index) =>
  debugEvent(
    `n${index + 1}`,
    "debug_ybot",
    entry.action,
    NEW_CLIPS_START_S + index * NEW_CLIP_SLOT_S,
    NEW_CLIPS_START_S + index * NEW_CLIP_SLOT_S + NEW_CLIP_PLAY_S,
    entry.style,
  ),
);

export function rigDebugClipLines(hasClip: (name: string) => boolean): readonly RigDebugClipLine[] {
  return RIG_DEBUG_NEW_CLIPS.map((entry, index) => {
    const event = newClipEvents[index]!;
    return {
      ...entry,
      eventId: event.id,
      tStart: event.tStart,
      tEnd: event.tEnd,
      plays: chooseClip(ACTION_MAP[entry.action], hasClip, entry.style),
    };
  });
}

export const RIG_DEBUG_GRAPH: ResolvedGraph = {
  sceneId: "rig_debug",
  version: 1,
  durationS: NEW_CLIPS_START_S + RIG_DEBUG_NEW_CLIPS.length * NEW_CLIP_SLOT_S,
  actors: RIG_DEBUG_ACTORS.map((actor) => ({ id: actor.id, label: actor.id, role: "other", rig: actor.rig })),
  events: [
    debugEvent("d1", "debug_ybot", "walk", 0, 6),
    debugEvent("d2", "debug_ybot", "fall", 6, 8),
    debugEvent("d3", "debug_xbot", "walk", 0, 6),
    debugEvent("d4", "debug_xbot", "speak", 6, 12),
    ...newClipEvents,
  ],
  props: [],
};
