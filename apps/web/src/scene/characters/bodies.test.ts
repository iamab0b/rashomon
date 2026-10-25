import { robberyGraph } from "@rashomon/schema/fixtures";
import {
  Bone,
  BoxGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshStandardMaterial,
  Skeleton,
  SkinnedMesh,
  Uint16BufferAttribute,
  type Material,
} from "three";
import { describe, expect, test, vi } from "vitest";
import {
  actorLook,
  BODY_SPECS,
  bodyScale,
  loadLook,
  MIXAMO_CORE_BONES,
  skeletonProblem,
  strideLookup,
  type CharacterLook,
  type LookLoaders,
} from "./bodies";
import { instantiate } from "./Character";
import { disposeMaterials, findSkinMaterials, ownMaterials, tintClothing } from "./materials";
import { measureRig } from "./measureRig";
import { MIXAMO_UNIT_SCALE } from "./rigs";

const CM_PER_M = 100;

type Synthetic = { root: Group; skin: MeshStandardMaterial; shirt: MeshStandardMaterial };

function synthetic(heightCm: number, boneNames: readonly string[] = MIXAMO_CORE_BONES): Synthetic {
  const bones = boneNames.map((name) => {
    const bone = new Bone();
    bone.name = name;
    return bone;
  });
  bones.slice(1).forEach((bone, index) => {
    bones[index]!.add(bone);
    bone.position.y = heightCm / bones.length;
  });
  const geometry = new BoxGeometry(40, heightCm, 20).translate(0, heightCm / 2, 0);
  const vertices = geometry.getAttribute("position").count;
  geometry.setAttribute("skinIndex", new Uint16BufferAttribute(new Array<number>(vertices * 4).fill(0), 4));
  geometry.setAttribute("skinWeight", new Float32BufferAttribute(new Array<number>(vertices).fill(0).flatMap(() => [1, 0, 0, 0]), 4));
  geometry.clearGroups();
  const half = geometry.index!.count / 2;
  geometry.addGroup(0, half, 0);
  geometry.addGroup(half, half, 1);
  const skin = new MeshStandardMaterial({ color: "#d9a07a", name: "Ch_Material_A" });
  const shirt = new MeshStandardMaterial({ color: "#3060c0", name: "Ch_Material_B" });
  const mesh = new SkinnedMesh(geometry, [skin, shirt]);
  const root = new Group();
  root.add(bones[0]!);
  root.add(mesh);
  mesh.bind(new Skeleton(bones));
  return { root, skin, shirt };
}

const rigSource = () => synthetic(180).root;

function loaders(body: () => Promise<Group>): LookLoaders & { warn: ReturnType<typeof vi.fn> } {
  return { loadRig: vi.fn(async () => rigSource()), loadBody: vi.fn(body), warn: vi.fn() };
}

const colorOf = (material: Material) => (material as MeshStandardMaterial).color.getHexString();

describe("a body scales to the witness's height", () => {
  test("heightM sets the rig's measured height on a synthetic skeleton, and no heightM keeps the body's base height", () => {
    const spec = BODY_SPECS.heavy_tall;
    const source = synthetic(spec.baseHeightM * CM_PER_M).root;
    const look: CharacterLook = { rig: "mixamo_ybot", body: "heavy_tall", heightM: 1.62 };
    const scaled = instantiate(look, { source, body: "heavy_tall" });
    expect(measureRig(scaled).height).toBeCloseTo(1.62, 3);
    expect(scaled.root.scale.x).toBeCloseTo(MIXAMO_UNIT_SCALE * (1.62 / spec.baseHeightM), 9);
    expect(scaled.root.scale.y).toBe(scaled.root.scale.x);
    expect(scaled.root.scale.z).toBe(scaled.root.scale.x);
    const base = instantiate({ rig: "mixamo_ybot", body: "heavy_tall" }, { source, body: "heavy_tall" });
    expect(measureRig(base).height).toBeCloseTo(spec.baseHeightM, 3);
  });

  test("scaling never moves the root: it stays at its parent's origin, on the resolver's path", () => {
    const source = synthetic(BODY_SPECS.slim_short.baseHeightM * CM_PER_M).root;
    const handle = instantiate({ rig: "mixamo_ybot", body: "slim_short", heightM: 2.0 }, { source, body: "slim_short" });
    expect(handle.root.position.toArray()).toEqual([0, 0, 0]);
    const hips = handle.hips!.getWorldPosition(handle.hips!.position.clone());
    expect(hips.x).toBeCloseTo(0, 9);
    expect(hips.z).toBeCloseTo(0, 9);
  });

  test("the measured report carries the bone count, the hips and an eye height", () => {
    const source = synthetic(BODY_SPECS.average_tall.baseHeightM * CM_PER_M).root;
    const report = measureRig(instantiate({ rig: "mixamo_ybot", body: "average_tall" }, { source, body: "average_tall" }));
    expect(report).toMatchObject({ name: "average_tall", bones: MIXAMO_CORE_BONES.length, hipBone: "mixamorigHips", eyeEstimated: true });
    expect(report.eyeY).toBeGreaterThan(report.hipY);
    expect(report.eyeY).toBeLessThan(report.height);
  });

  test("a rig without a body is never scaled", () => {
    expect(bodyScale(undefined, 1.9)).toBe(1);
    expect(bodyScale("slim_tall", undefined)).toBe(1);
    const handle = instantiate({ rig: "mixamo_xbot", heightM: 1.9 }, { source: rigSource(), body: undefined });
    expect(handle.root.scale.x).toBe(MIXAMO_UNIT_SCALE);
  });
});

describe("loading a body falls back to Actor.rig", () => {
  test("a missing body file draws the rig with a warning, not an error", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const l = loaders(() => Promise.reject(new Error("404 /characters/body_heavy_tall.fbx")));
    const loaded = await loadLook({ rig: "mixamo_xbot", body: "heavy_tall" }, l);
    expect(loaded.body).toBeUndefined();
    expect(l.loadRig).toHaveBeenCalledWith("mixamo_xbot");
    expect(l.warn).toHaveBeenCalledTimes(1);
    expect(l.warn.mock.calls[0]![0]).toBe("body heavy_tall failed to load; drawing rig mixamo_xbot instead");
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });

  test("a body whose bone names do not match the Mixamo skeleton is refused with the warning", async () => {
    const renamed = MIXAMO_CORE_BONES.map((name) => name.replace("mixamorig", "mixamorig1"));
    const l = loaders(async () => synthetic(185, renamed).root);
    const loaded = await loadLook({ rig: "mixamo_ybot", body: "heavy_tall" }, l);
    expect(loaded.body).toBeUndefined();
    expect(l.loadRig).toHaveBeenCalledWith("mixamo_ybot");
    expect(l.warn.mock.calls[0]![0]).toMatch(
      /^body heavy_tall refused: its bone names do not match the Mixamo skeleton \(missing mixamorigHips, .*\); drawing rig mixamo_ybot instead$/,
    );
  });

  test("a body FBX with a mesh but no skeleton at all is refused with the same warning and falls back", async () => {
    const meshOnly = new Group().add(new Mesh(new BoxGeometry(40, 180, 20), new MeshStandardMaterial()));
    expect(skeletonProblem(meshOnly)).toBe("it has no skinned mesh and no skeleton");
    const l = loaders(async () => meshOnly);
    const loaded = await loadLook({ rig: "mixamo_ybot", body: "slim_tall" }, l);
    expect(loaded.body).toBeUndefined();
    expect(l.loadRig).toHaveBeenCalledWith("mixamo_ybot");
    expect(l.warn.mock.calls[0]![0]).toBe(
      "body slim_tall refused: it has no skinned mesh and no skeleton; drawing rig mixamo_ybot instead",
    );
  });

  test("a body that loads and matches is used, and clips bind to it by the same bone names", async () => {
    const source = synthetic(185).root;
    const l = loaders(async () => source);
    const loaded = await loadLook({ rig: "mixamo_ybot", body: "heavy_tall" }, l);
    expect(loaded).toEqual({ source, body: "heavy_tall" });
    expect(l.loadRig).not.toHaveBeenCalled();
    expect(l.warn).not.toHaveBeenCalled();
    const handle = instantiate({ rig: "mixamo_ybot", body: "heavy_tall" }, loaded);
    expect(handle.hips?.name).toBe("mixamorigHips");
  });
});

describe("clothing tint", () => {
  test("multiplies the clothing materials only, on the owned clones, and they are disposed with them", () => {
    const { root, skin, shirt } = synthetic(180);
    const owned = ownMaterials(root);
    const tinted = tintClothing(root, "#b22222", owned);
    const [ownedSkin, ownedShirt] = (root.children[1] as SkinnedMesh).material as Material[];
    expect(tinted).toEqual([ownedShirt]);
    expect(colorOf(ownedShirt!)).toBe(new Color("#3060c0").multiply(new Color("#b22222")).getHexString());
    expect(colorOf(ownedSkin!)).toBe(new Color("#d9a07a").getHexString());
    expect(colorOf(shirt)).toBe(new Color("#3060c0").getHexString());
    expect(colorOf(skin)).toBe(new Color("#d9a07a").getHexString());
    const spies = owned.map((material) => vi.spyOn(material, "dispose"));
    disposeMaterials(owned);
    spies.forEach((spy) => expect(spy).toHaveBeenCalledTimes(1));
  });

  test("a material named like skin or body is the skin, whatever its colour", () => {
    const { root, skin, shirt } = synthetic(180);
    skin.color.set("#3060c0");
    shirt.color.set("#d9a07a");
    shirt.name = "Body";
    expect([...findSkinMaterials(root)]).toEqual([shirt]);
  });

  test("with no skin found every material is tinted", () => {
    const { root, skin } = synthetic(180);
    skin.color.set("#20a040");
    const owned = ownMaterials(root);
    expect(findSkinMaterials(root).size).toBe(0);
    expect(tintClothing(root, "#808080", owned)).toHaveLength(2);
  });

  test("skin split across meshes keeps every one of its owned clones untinted", () => {
    const { root, skin, shirt } = synthetic(180);
    const hands = new Mesh(new BoxGeometry(10, 10, 10), skin);
    const face = new Mesh(new BoxGeometry(10, 10, 10), skin);
    root.add(hands, face);
    const owned = ownMaterials(root);
    const tinted = tintClothing(root, "#b22222", owned);
    const skinClones = owned.filter((material) => material.name === skin.name);
    expect(skinClones).toHaveLength(3);
    for (const clone of skinClones) expect(colorOf(clone)).toBe(new Color("#d9a07a").getHexString());
    expect(tinted.map((material) => material.name)).toEqual([shirt.name]);
  });

  test("named skin split across meshes is all excluded too", () => {
    const { root, skin } = synthetic(180);
    skin.name = "Skin";
    root.add(new Mesh(new BoxGeometry(10, 10, 10), skin));
    const owned = ownMaterials(root);
    tintClothing(root, "#b22222", owned);
    for (const clone of owned.filter((material) => material.name === "Skin")) {
      expect(colorOf(clone)).toBe(new Color("#d9a07a").getHexString());
    }
  });

  test("instantiate tints a body's clothing and keeps the tinted clones in the owned list", () => {
    const { root } = synthetic(185);
    const handle = instantiate({ rig: "mixamo_ybot", body: "heavy_tall", tint: "#2554a8" }, { source: root, body: "heavy_tall" });
    const [ownedSkin, ownedShirt] = handle.skinnedMeshes[0]!.material as Material[];
    expect(handle.ownedMaterials).toContain(ownedShirt);
    expect(colorOf(ownedShirt!)).toBe(new Color("#3060c0").multiply(new Color("#2554a8")).getHexString());
    expect(colorOf(ownedSkin!)).toBe(new Color("#d9a07a").getHexString());
  });
});

describe("the robbery fixture has no body fields", () => {
  test("its actors' looks are the rig alone: loaded from Actor.rig, unscaled and untinted", async () => {
    for (const actor of robberyGraph.actors) {
      const look = actorLook(actor.rig, actor);
      expect(look).toEqual({ rig: actor.rig });
      const l = loaders(async () => synthetic(185).root);
      const loaded = await loadLook(look, l);
      expect(l.loadBody).not.toHaveBeenCalled();
      expect(l.loadRig).toHaveBeenCalledWith(actor.rig);
      const { root, skin, shirt } = synthetic(180);
      const handle = instantiate(look, { source: root, body: loaded.body });
      expect(handle.root.scale.toArray()).toEqual([MIXAMO_UNIT_SCALE, MIXAMO_UNIT_SCALE, MIXAMO_UNIT_SCALE]);
      expect(handle.name).toBe(actor.rig);
      const [ownedSkin, ownedShirt] = handle.skinnedMeshes[0]!.material as Material[];
      expect(colorOf(ownedSkin!)).toBe(colorOf(skin));
      expect(colorOf(ownedShirt!)).toBe(colorOf(shirt));
    }
  });

  test("a described actor's look carries its body, height and tint", () => {
    expect(
      actorLook("mixamo_ybot", { id: "a", label: "A", role: "other", rig: "mixamo_ybot", body: "heavy_tall", heightM: 1.88, tint: "#b22222" }),
    ).toEqual({ rig: "mixamo_ybot", body: "heavy_tall", heightM: 1.88, tint: "#b22222" });
  });
});

describe("a height-scaled body's stride", () => {
  test("the locomotion cycle distance scales with the root, and an unscaled rig keeps the clip's own", () => {
    const cycle = (clip: string) => (clip === "clip_walk" ? 1.4 : undefined);
    const source = synthetic(BODY_SPECS.heavy_short.baseHeightM * CM_PER_M).root;
    const handle = instantiate({ rig: "mixamo_ybot", body: "heavy_short", heightM: 1.5 }, { source, body: "heavy_short" });
    expect(handle.scale).toBeCloseTo(1.5 / BODY_SPECS.heavy_short.baseHeightM, 9);
    expect(strideLookup(cycle, handle.scale)("clip_walk")).toBeCloseTo(1.4 * handle.scale, 9);
    expect(strideLookup(cycle, handle.scale)("clip_idle")).toBeUndefined();
    const rig = instantiate({ rig: "mixamo_ybot", heightM: 1.9 }, { source: rigSource(), body: undefined });
    expect(rig.scale).toBe(1);
    expect(strideLookup(cycle, rig.scale)).toBe(cycle);
  });
});
