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

export const OPTIONAL_CLIP_NAMES = [
  "clip_open_door",
  "clip_hands_up",
  "clip_pointing",
  "clip_reach",
  "clip_throw",
  "clip_kneel",
  "clip_sneak",
  "clip_stumble_back",
  "clip_fall_forward",
  "clip_run_scared",
  "clip_jump_over",
  "clip_phone",
  "clip_open_door_out",
  "clip_drink",
  "clip_look_behind",
  "clip_dodge",
] as const;

export type OptionalClipName = (typeof OPTIONAL_CLIP_NAMES)[number];

export const HIPS_POSITION_TRACK = "mixamorigHips.position";
const VECTOR3_STRIDE = 3;

const clipCache = new Map<string, AnimationClip>();
let loadingAll: Promise<ReadonlyMap<string, AnimationClip>> | null = null;
let optionalTried = false;

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

const isOptional = (name: string): boolean => (OPTIONAL_CLIP_NAMES as readonly string[]).includes(name);

function clipsToLoad(): string[] {
  const required = CLIP_NAMES.filter((name) => !clipCache.has(name));
  const retryOptional = !optionalTried || required.length > 0;
  const optional = retryOptional ? OPTIONAL_CLIP_NAMES.filter((name) => !clipCache.has(name)) : [];
  optionalTried = true;
  return [...required, ...optional];
}

async function loadMissingClips(): Promise<ReadonlyMap<string, AnimationClip>> {
  const missing = clipsToLoad();
  const results = await Promise.allSettled(missing.map(loadClip));
  results.forEach((result, index) => {
    const name = missing[index];
    if (result.status === "rejected") {
      if (name !== undefined && isOptional(name)) console.info(`optional clip ${name} not loaded, its action falls back`);
      else console.warn(`clip ${name} failed to load`, result.reason);
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
