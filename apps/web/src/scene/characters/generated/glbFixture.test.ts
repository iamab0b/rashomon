import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { describe, expect, test } from "vitest";
import { GENERATED_FIXTURE_VERB } from "../../playback/generatedFixture";
import { HIPS_POSITION_TRACK } from "../clips";
import { findPrimarySkinnedMesh, findSkinnedMeshes, MIXAMO_UNIT_SCALE } from "../rigs";
import { prepareGeneratedClip } from "./generatedClip";

const NODE_FS: string = "node:fs/promises";
const NODE_FS_SYNC: string = "node:fs";
const MIN_HIPS_HEIGHT_M = 0.5;
const MAX_HIPS_HEIGHT_M = 1.2;

type ReadFile = (path: URL) => Promise<Uint8Array>;

const glbUrl = new URL(`../../../../public/generated/${GENERATED_FIXTURE_VERB}.glb`, import.meta.url);
const rigUrl = new URL("../../../../public/characters/ybot.fbx", import.meta.url);
const nodeFs: { existsSync: (path: URL) => boolean } = await import(NODE_FS_SYNC);
const present = nodeFs.existsSync(glbUrl) && nodeFs.existsSync(rigUrl);

if (!present) {
  console.info("glbFixture.test: skipping, public/generated and public/characters are gitignored and not present");
}

async function read(url: URL): Promise<ArrayBuffer> {
  const fs: { readFile: ReadFile } = await import(NODE_FS);
  const bytes = await fs.readFile(url);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

describe.skipIf(!present)("the recorded Uthana GLB on the Y Bot", () => {
  test("every track binds to a bone of the Y Bot's primary skeleton", async () => {
    const gltf = await new GLTFLoader().parseAsync(await read(glbUrl), "");
    const rig = new FBXLoader().parse(await read(rigUrl), "");
    const mesh = findPrimarySkinnedMesh(findSkinnedMeshes(rig));
    const bones = new Set(mesh?.skeleton.bones.map((bone) => bone.name));

    const clip = prepareGeneratedClip(`gen_${GENERATED_FIXTURE_VERB}`, gltf);
    const unbound = clip.tracks.map((track) => track.name.split(".")[0]).filter((name) => !bones.has(name ?? ""));

    expect(clip.tracks.length).toBeGreaterThan(50);
    expect(unbound).toEqual([]);
  });

  test("hips stay at standing height over the floor with no horizontal travel", async () => {
    const gltf = await new GLTFLoader().parseAsync(await read(glbUrl), "");

    const clip = prepareGeneratedClip(`gen_${GENERATED_FIXTURE_VERB}`, gltf);
    const hips = Array.from(clip.tracks.find((track) => track.name === HIPS_POSITION_TRACK)?.values ?? []);
    const axis = (offset: number) => hips.filter((_, index) => index % 3 === offset);

    expect(axis(0).every((v) => v === 0)).toBe(true);
    expect(axis(2).every((v) => v === 0)).toBe(true);
    expect(Math.min(...axis(1)) * MIXAMO_UNIT_SCALE).toBeGreaterThan(MIN_HIPS_HEIGHT_M);
    expect(Math.max(...axis(1)) * MIXAMO_UNIT_SCALE).toBeLessThan(MAX_HIPS_HEIGHT_M);
  });
});
