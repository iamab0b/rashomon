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

type RigDebugClipSpec = {
  readonly clip: ActionClipName;
  readonly action: Action;
  readonly style?: ActionStyle;
};

export const RIG_DEBUG_CLIP_SPECS: readonly RigDebugClipSpec[] = [
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

export type ClipDuration = (name: string) => number | undefined;

export const RIG_DEBUG_FIRST_SLOT_S = 12;
export const RIG_DEBUG_SLOT_GAP_S = 0.5;
export const RIG_DEBUG_DEFAULT_SLOT_S = 2.5;
export const RIG_DEBUG_TAIL_S = 1;

export type RigDebugClip = RigDebugClipSpec & {
  readonly tStart: number;
  readonly tEnd: number;
};

export type RigDebugLayout = {
  readonly clips: readonly RigDebugClip[];
  readonly durationS: number;
};

export function layoutRigDebugClips(durationOf: ClipDuration): RigDebugLayout {
  const hasClip = (name: string) => durationOf(name) !== undefined;
  let cursor = RIG_DEBUG_FIRST_SLOT_S;
  const clips = RIG_DEBUG_CLIP_SPECS.map((spec): RigDebugClip => {
    const played = chooseClip(ACTION_MAP[spec.action], hasClip, spec.style);
    const length = durationOf(played) ?? RIG_DEBUG_DEFAULT_SLOT_S;
    const slot = { ...spec, tStart: cursor, tEnd: cursor + length };
    cursor = slot.tEnd + RIG_DEBUG_SLOT_GAP_S;
    return slot;
  });
  const last = clips[clips.length - 1];
  return { clips, durationS: (last?.tEnd ?? RIG_DEBUG_FIRST_SLOT_S) + RIG_DEBUG_TAIL_S };
}

export type RigDebugClipLine = RigDebugClip & {
  readonly eventId: string;
  readonly plays: string;
};

export function rigDebugClipLines(layout: RigDebugLayout, hasClip: (name: string) => boolean): readonly RigDebugClipLine[] {
  return layout.clips.map((entry, index) => ({
    ...entry,
    eventId: `n${index + 1}`,
    plays: chooseClip(ACTION_MAP[entry.action], hasClip, entry.style),
  }));
}

export function buildRigDebugGraph(layout: RigDebugLayout): ResolvedGraph {
  return {
    sceneId: "rig_debug",
    version: 1,
    durationS: layout.durationS,
    actors: RIG_DEBUG_ACTORS.map((actor) => ({ id: actor.id, label: actor.id, role: "other", rig: actor.rig })),
    events: [
      debugEvent("d1", "debug_ybot", "walk", 0, 6),
      debugEvent("d2", "debug_ybot", "fall", 6, 8),
      debugEvent("d3", "debug_xbot", "walk", 0, 6),
      debugEvent("d4", "debug_xbot", "speak", 6, 12),
      ...layout.clips.map((entry, index) =>
        debugEvent(`n${index + 1}`, "debug_ybot", entry.action, entry.tStart, entry.tEnd, entry.style),
      ),
    ],
    props: [],
  };
}
