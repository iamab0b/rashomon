import { describe, expect, test } from "vitest";
import type { AnimationClip } from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { HIPS_POSITION_TRACK, prepareClip } from "./clips";
import { MIXAMO_UNIT_SCALE } from "./rigs";

const NODE_FS: string = "node:fs/promises";
const MAX_HORIZONTAL_TRAVEL_M = 0.05;

type ReadFile = (path: URL) => Promise<Uint8Array>;

async function readClipFile(name: string): Promise<ArrayBuffer> {
  const fs: { readFile: ReadFile } = await import(NODE_FS);
  const bytes = await fs.readFile(new URL(`../../../public/clips/${name}.fbx`, import.meta.url));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function loadSourceClip(name: string): Promise<AnimationClip> {
  const source = new FBXLoader().parse(await readClipFile(name), "");
  const clip = source.animations[0];
  if (!clip) throw new Error(`${name} has no animations`);
  return clip;
}

function hipsTravel(clip: AnimationClip): { x: number; y: number; z: number } {
  const track = clip.tracks.find((candidate) => candidate.name === HIPS_POSITION_TRACK);
  if (!track) throw new Error(`${clip.name} has no ${HIPS_POSITION_TRACK} track`);
  const axis = (offset: number): number => {
    const values = Array.from(track.values).filter((_, index) => index % 3 === offset);
    return (Math.max(...values) - Math.min(...values)) * MIXAMO_UNIT_SCALE;
  };
  return { x: axis(0), y: axis(1), z: axis(2) };
}

describe("clip root-motion strip", () => {
  test("clip_walk hips move less than 0.05 m horizontally over one cycle", async () => {
    const source = await loadSourceClip("clip_walk");

    const travel = hipsTravel(prepareClip("clip_walk", source));

    expect(travel.x).toBeLessThan(MAX_HORIZONTAL_TRAVEL_M);
    expect(travel.z).toBeLessThan(MAX_HORIZONTAL_TRAVEL_M);
  });

  test("clip_walk keeps the vertical hip bob", async () => {
    const source = await loadSourceClip("clip_walk");

    const stripped = hipsTravel(prepareClip("clip_walk", source));

    expect(stripped.y).toBeCloseTo(hipsTravel(source).y, 6);
    expect(stripped.y).toBeGreaterThan(0);
  });

  test("source clip is not mutated by the strip", async () => {
    const source = await loadSourceClip("clip_walk");
    const before = hipsTravel(source);

    prepareClip("clip_walk", source);

    expect(hipsTravel(source)).toEqual(before);
    expect(before.z).toBeGreaterThan(1);
  });
});
