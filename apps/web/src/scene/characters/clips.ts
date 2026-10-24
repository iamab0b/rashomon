import { AnimationClip, VectorKeyframeTrack, type KeyframeTrack } from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";

export const CLIP_NAMES = [
  "clip_idle",
  "clip_walk",
  "clip_run",
  "clip_crouch_idle",
  "clip_fall_back",
  "clip_push",
  "clip_shoved",
  "clip_punch",
  "clip_pick_up",
  "clip_look_around",
  "clip_talk",
  "clip_stand_up",
] as const;

export type ClipName = (typeof CLIP_NAMES)[number];

export const HIPS_POSITION_TRACK = "mixamorigHips.position";
const VECTOR3_STRIDE = 3;

const clipCache = new Map<string, AnimationClip>();
let loadingAll: Promise<ReadonlyMap<string, AnimationClip>> | null = null;

function clipUrl(name: string): string {
  return `/clips/${name}.fbx`;
}

function stripHorizontalHips(track: KeyframeTrack): KeyframeTrack {
  if (track.name !== HIPS_POSITION_TRACK) return track;
  const values = Float32Array.from(track.values, (value, index) =>
    index % VECTOR3_STRIDE === 1 ? value : 0,
  );
  return new VectorKeyframeTrack(track.name, Array.from(track.times), Array.from(values));
}

export function prepareClip(name: string, source: AnimationClip): AnimationClip {
  return new AnimationClip(name, source.duration, source.tracks.map(stripHorizontalHips));
}

async function loadClip(name: string): Promise<AnimationClip> {
  const source = await new FBXLoader().loadAsync(clipUrl(name));
  const first = source.animations[0];
  if (!first) throw new Error(`${clipUrl(name)} has no animations`);
  return prepareClip(name, first);
}

async function loadMissingClips(): Promise<ReadonlyMap<string, AnimationClip>> {
  const missing = CLIP_NAMES.filter((name) => !clipCache.has(name));
  const results = await Promise.allSettled(missing.map(loadClip));
  results.forEach((result, index) => {
    const name = missing[index];
    if (result.status === "rejected") {
      console.warn(`clip ${name} failed to load`, result.reason);
      return;
    }
    const clip = result.value;
    clipCache.set(clip.name, clip);
    console.info(`clip ${clip.name}: ${clip.duration.toFixed(2)} s, ${clip.tracks.length} tracks`);
  });
  return clipCache;
}

export function loadClips(): Promise<ReadonlyMap<string, AnimationClip>> {
  if (loadingAll) return loadingAll;
  const pending = loadMissingClips().then(
    (clips) => {
      if (CLIP_NAMES.some((name) => !clips.has(name))) loadingAll = null;
      return clips;
    },
    (error: unknown) => {
      loadingAll = null;
      throw error;
    },
  );
  loadingAll = pending;
  return pending;
}

export function getClip(name: string): AnimationClip | undefined {
  return clipCache.get(name);
}
