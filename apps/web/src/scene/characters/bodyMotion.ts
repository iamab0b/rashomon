import { AnimationClip, VectorKeyframeTrack, type KeyframeTrack } from "three";
import type { CharacterHandle } from "./Character";
import { HIPS_POSITION_TRACK } from "./clips";

const VECTOR3_STRIDE = 3;
const scaledClips = new WeakMap<AnimationClip, Map<number, AnimationClip>>();

export type BodyMotion = {
  readonly hipsRatio: number;
  readonly strideScale: number;
};

export const UNCHANGED_MOTION: BodyMotion = { hipsRatio: 1, strideScale: 1 };

export function clipRestHipsY(idle: AnimationClip | undefined): number | undefined {
  const values = idle?.tracks.find((track) => track.name === HIPS_POSITION_TRACK)?.values;
  const y = values?.[1];
  return y !== undefined && y > 0 ? y : undefined;
}

export function bodyMotion(handle: CharacterHandle, clipHipsY: number | undefined): BodyMotion {
  if (handle.body === undefined || handle.restHipsY === undefined || clipHipsY === undefined) {
    return { hipsRatio: 1, strideScale: handle.scale };
  }
  const hipsRatio = handle.restHipsY / clipHipsY;
  return { hipsRatio, strideScale: handle.scale * hipsRatio };
}

function scaleHipsHeight(track: KeyframeTrack, ratio: number): KeyframeTrack {
  if (track.name !== HIPS_POSITION_TRACK) return track;
  const values = Array.from(track.values, (value, index) => (index % VECTOR3_STRIDE === 1 ? value * ratio : value));
  return new VectorKeyframeTrack(track.name, Array.from(track.times), values);
}

export function clipForBody(clip: AnimationClip, hipsRatio: number): AnimationClip {
  if (hipsRatio === 1) return clip;
  const byRatio = scaledClips.get(clip) ?? new Map<number, AnimationClip>();
  scaledClips.set(clip, byRatio);
  const cached = byRatio.get(hipsRatio);
  if (cached) return cached;
  const scaled = new AnimationClip(clip.name, clip.duration, clip.tracks.map((track) => scaleHipsHeight(track, hipsRatio)));
  byRatio.set(hipsRatio, scaled);
  return scaled;
}
