import { AnimationClip, QuaternionKeyframeTrack, VectorKeyframeTrack } from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { describe, expect, test } from "vitest";
import { CLIP_NAMES, HIPS_POSITION_TRACK, prepareClip } from "./clips";
import { MIXAMO_UNIT_SCALE } from "./rigs";

const NODE_FS: string = "node:fs/promises";
const NODE_FS_SYNC: string = "node:fs";
const MAX_HORIZONTAL_TRAVEL_M = 0.05;
const MIN_SOURCE_TRAVEL_M = { clip_walk: 1, clip_run: 1, clip_push: 1, clip_fall_back: 0.5 } as const;

type ReadFile = (path: URL) => Promise<Uint8Array>;
type Axes = { x: number; y: number; z: number };

const clipsDir = new URL("../../../public/clips/", import.meta.url);
const nodeFs: { existsSync: (path: URL) => boolean } = await import(NODE_FS_SYNC);
const assetsPresent = CLIP_NAMES.every((name) => nodeFs.existsSync(new URL(`${name}.fbx`, clipsDir)));

if (!assetsPresent) {
  console.info("clips.test: skipping FBX-backed tests, public/clips is gitignored and not present");
}

async function readClipFile(name: string): Promise<ArrayBuffer> {
  const fs: { readFile: ReadFile } = await import(NODE_FS);
  const bytes = await fs.readFile(new URL(`${name}.fbx`, clipsDir));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function loadSourceClip(name: string): Promise<AnimationClip> {
  const source = new FBXLoader().parse(await readClipFile(name), "");
  const clip = source.animations[0];
  if (!clip) throw new Error(`${name} has no animations`);
  return clip;
}

function hipsTravel(clip: AnimationClip, scale: number): Axes {
  const track = clip.tracks.find((candidate) => candidate.name === HIPS_POSITION_TRACK);
  if (!track) throw new Error(`${clip.name} has no ${HIPS_POSITION_TRACK} track`);
  const axis = (offset: number): number => {
    const values = Array.from(track.values).filter((_, index) => index % 3 === offset);
    return (Math.max(...values) - Math.min(...values)) * scale;
  };
  return { x: axis(0), y: axis(1), z: axis(2) };
}

describe("prepareClip on a synthetic clip", () => {
  const hips = new VectorKeyframeTrack(HIPS_POSITION_TRACK, [0, 1, 2], [0, 100, 0, 30, 104, 250, 60, 98, 500]);
  const spine = new QuaternionKeyframeTrack("mixamorigSpine.quaternion", [0, 1], [0, 0, 0, 1, 0, 0.1, 0, 0.99]);
  const source = new AnimationClip("synthetic", 2, [hips, spine]);

  test("zeroes hips X and Z", () => {
    const hipsOut = prepareClip("synthetic", source).tracks.find((t) => t.name === HIPS_POSITION_TRACK);

    const values = Array.from(hipsOut?.values ?? []);
    expect(values.filter((_, index) => index % 3 === 0).every((v) => v === 0)).toBe(true);
    expect(values.filter((_, index) => index % 3 === 2).every((v) => v === 0)).toBe(true);
  });

  test("keeps hips Y exactly", () => {
    const hipsOut = prepareClip("synthetic", source).tracks.find((t) => t.name === HIPS_POSITION_TRACK);

    const ys = Array.from(hipsOut?.values ?? []).filter((_, index) => index % 3 === 1);
    expect(ys).toEqual([100, 104, 98]);
  });

  test("keeps keyframe times and leaves other tracks as they were", () => {
    const out = prepareClip("synthetic", source);

    expect(Array.from(out.tracks[0]?.times ?? [])).toEqual([0, 1, 2]);
    expect(out.tracks[1]).toBe(spine);
    expect(out.name).toBe("synthetic");
    expect(out.duration).toBe(2);
  });

  test("does not mutate the source clip", () => {
    prepareClip("synthetic", source);

    expect(Array.from(hips.values)).toEqual([0, 100, 0, 30, 104, 250, 60, 98, 500]);
    expect(source.tracks[0]).toBe(hips);
  });

  test("passes clips without a hips position track through unchanged", () => {
    const bare = new AnimationClip("bare", 1, [spine]);

    expect(prepareClip("bare", bare).tracks).toEqual([spine]);
  });
});

describe.skipIf(!assetsPresent)("prepareClip on the Mixamo FBX clips", () => {
  const stripped = ["clip_walk", "clip_run", "clip_push", "clip_fall_back"] as const;

  test.each(stripped)("%s hips move less than 0.05 m horizontally", async (name) => {
    const source = await loadSourceClip(name);

    const travel = hipsTravel(prepareClip(name, source), MIXAMO_UNIT_SCALE);

    expect(travel.x).toBeLessThan(MAX_HORIZONTAL_TRAVEL_M);
    expect(travel.z).toBeLessThan(MAX_HORIZONTAL_TRAVEL_M);
  });

  test.each(stripped)("%s source clip really had root motion", async (name) => {
    const source = await loadSourceClip(name);

    const travel = hipsTravel(source, MIXAMO_UNIT_SCALE);

    expect(Math.hypot(travel.x, travel.z)).toBeGreaterThan(MIN_SOURCE_TRAVEL_M[name]);
  });

  test.each(CLIP_NAMES)("%s keeps its vertical hip motion", async (name) => {
    const source = await loadSourceClip(name);

    const stripped = hipsTravel(prepareClip(name, source), MIXAMO_UNIT_SCALE);

    expect(stripped.y).toBeCloseTo(hipsTravel(source, MIXAMO_UNIT_SCALE).y, 6);
  });
});
