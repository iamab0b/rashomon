import type { Action } from "@rashomon/schema";
import type { ClipName } from "./clips";

export type ActionClipName = ClipName | "clip_open_door";

export type ReactionSpec = {
  readonly clip: ClipName;
  readonly delayS: number;
};

export type ActionSpec = {
  readonly clip: ActionClipName;
  readonly fallbackClip?: ClipName;
  readonly loop: boolean;
  readonly holdLastFrame: boolean;
  readonly blendInS: number;
  readonly blendOutS: number;
  readonly targetReaction?: ReactionSpec;
  readonly propAttachAt?: number;
  readonly propDetachAt?: number;
};

export const IDLE_CLIP: ClipName = "clip_idle";

const SHOVED_REACTION: ReactionSpec = { clip: "clip_shoved", delayS: 0.3 };

export const ACTION_MAP: Readonly<Record<Action, ActionSpec>> = {
  stand: { clip: "clip_idle", loop: true, holdLastFrame: false, blendInS: 0.2, blendOutS: 0.2 },
  walk: { clip: "clip_walk", loop: true, holdLastFrame: false, blendInS: 0.25, blendOutS: 0.25 },
  run: { clip: "clip_run", loop: true, holdLastFrame: false, blendInS: 0.15, blendOutS: 0.15 },
  crouch: { clip: "clip_crouch_idle", loop: true, holdLastFrame: false, blendInS: 0.3, blendOutS: 0.3 },
  fall: { clip: "clip_fall_back", loop: false, holdLastFrame: true, blendInS: 0.1, blendOutS: 0 },
  shove: {
    clip: "clip_push",
    loop: false,
    holdLastFrame: false,
    blendInS: 0.1,
    blendOutS: 0.2,
    targetReaction: SHOVED_REACTION,
  },
  punch: {
    clip: "clip_punch",
    loop: false,
    holdLastFrame: false,
    blendInS: 0.1,
    blendOutS: 0.2,
    targetReaction: SHOVED_REACTION,
  },
  pick_up: {
    clip: "clip_pick_up",
    loop: false,
    holdLastFrame: false,
    blendInS: 0.2,
    blendOutS: 0.2,
    propAttachAt: 0.6,
  },
  drop: { clip: "clip_idle", loop: true, holdLastFrame: false, blendInS: 0.2, blendOutS: 0.2, propDetachAt: 0 },
  throw: {
    clip: "clip_punch",
    loop: false,
    holdLastFrame: false,
    blendInS: 0.1,
    blendOutS: 0.2,
    propDetachAt: 0.4,
  },
  open_door: {
    clip: "clip_open_door",
    fallbackClip: "clip_idle",
    loop: false,
    holdLastFrame: false,
    blendInS: 0.2,
    blendOutS: 0.2,
  },
  look: { clip: "clip_look_around", loop: true, holdLastFrame: false, blendInS: 0.3, blendOutS: 0.3 },
  speak: { clip: "clip_talk", loop: true, holdLastFrame: false, blendInS: 0.3, blendOutS: 0.3 },
};

export function chooseClip(spec: ActionSpec, hasClip: (name: string) => boolean): string {
  if (hasClip(spec.clip)) return spec.clip;
  return spec.fallbackClip ?? IDLE_CLIP;
}
