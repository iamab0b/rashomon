import type { Action, ActionStyle } from "@rashomon/schema";
import type { ClipName, OptionalClipName } from "./clips";

export type ActionClipName = ClipName | OptionalClipName;

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
  readonly styles?: Readonly<Partial<Record<ActionStyle, ActionClipName>>>;
};

export const IDLE_CLIP: ClipName = "clip_idle";

const SHOVED_REACTION: ReactionSpec = { clip: "clip_shoved", delayS: 0.3 };

export const ACTION_MAP: Readonly<Record<Action, ActionSpec>> = {
  stand: { clip: "clip_idle", loop: true, holdLastFrame: false, blendInS: 0.2, blendOutS: 0.2 },
  walk: {
    clip: "clip_walk",
    loop: true,
    holdLastFrame: false,
    blendInS: 0.25,
    blendOutS: 0.25,
    styles: { sneak: "clip_sneak" },
  },
  run: {
    clip: "clip_run",
    loop: true,
    holdLastFrame: false,
    blendInS: 0.15,
    blendOutS: 0.15,
    styles: { scared: "clip_run_scared" },
  },
  crouch: { clip: "clip_crouch_idle", loop: true, holdLastFrame: false, blendInS: 0.3, blendOutS: 0.3 },
  fall: {
    clip: "clip_fall_back",
    loop: false,
    holdLastFrame: true,
    blendInS: 0.1,
    blendOutS: 0,
    styles: { forward: "clip_fall_forward" },
  },
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
    clip: "clip_throw",
    fallbackClip: "clip_punch",
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
    styles: { outward: "clip_open_door_out" },
  },
  look: {
    clip: "clip_look_around",
    loop: true,
    holdLastFrame: false,
    blendInS: 0.3,
    blendOutS: 0.3,
    styles: { behind: "clip_look_behind" },
  },
  speak: { clip: "clip_talk", loop: true, holdLastFrame: false, blendInS: 0.3, blendOutS: 0.3 },
  hands_up: {
    clip: "clip_hands_up",
    fallbackClip: "clip_idle",
    loop: true,
    holdLastFrame: false,
    blendInS: 0.2,
    blendOutS: 0.2,
  },
  point: {
    clip: "clip_pointing",
    fallbackClip: "clip_idle",
    loop: false,
    holdLastFrame: false,
    blendInS: 0.2,
    blendOutS: 0.2,
  },
  reach: {
    clip: "clip_reach",
    fallbackClip: "clip_pick_up",
    loop: false,
    holdLastFrame: false,
    blendInS: 0.2,
    blendOutS: 0.2,
  },
  kneel: {
    clip: "clip_kneel",
    fallbackClip: "clip_crouch_idle",
    loop: false,
    holdLastFrame: true,
    blendInS: 0.2,
    blendOutS: 0,
  },
  stumble: {
    clip: "clip_stumble_back",
    fallbackClip: "clip_shoved",
    loop: false,
    holdLastFrame: false,
    blendInS: 0.1,
    blendOutS: 0.2,
  },
  jump: {
    clip: "clip_jump_over",
    fallbackClip: "clip_idle",
    loop: false,
    holdLastFrame: false,
    blendInS: 0.1,
    blendOutS: 0.2,
  },
  phone: {
    clip: "clip_phone",
    fallbackClip: "clip_talk",
    loop: true,
    holdLastFrame: false,
    blendInS: 0.3,
    blendOutS: 0.3,
  },
  drink: {
    clip: "clip_drink",
    fallbackClip: "clip_idle",
    loop: false,
    holdLastFrame: true,
    blendInS: 0.3,
    blendOutS: 0.3,
  },
  dodge: {
    clip: "clip_dodge",
    fallbackClip: "clip_crouch_idle",
    loop: false,
    holdLastFrame: false,
    blendInS: 0.1,
    blendOutS: 0.2,
  },
};

export function chooseClip(spec: ActionSpec, hasClip: (name: string) => boolean, style?: ActionStyle): string {
  const styled = style === undefined ? undefined : spec.styles?.[style];
  if (styled !== undefined && hasClip(styled)) return styled;
  if (hasClip(spec.clip)) return spec.clip;
  return spec.fallbackClip ?? IDLE_CLIP;
}
