import { Group, Mesh, Object3D } from "three";
import { describe, expect, test } from "vitest";
import { buildPlaceholder, loadManifest, tagCollision } from "./scene";

describe("loadManifest", () => {
  test("returns the store fixture with 11 landmarks", () => {
    const manifest = loadManifest("store");

    expect(manifest.sceneId).toBe("store_v1");
    expect(manifest.landmarks).toHaveLength(11);
  });

  test("throws on an unknown fixture", () => {
    expect(() => loadManifest("nope")).toThrow(/unknown scene fixture "nope"/);
  });
});

describe("tagCollision", () => {
  test("marks dress_ objects as non-colliding and leaves others untouched", () => {
    const root = new Group();
    const dress = new Object3D();
    dress.name = "dress_bottle";
    const wall = new Object3D();
    wall.name = "wall_left";
    const nested = new Object3D();
    nested.name = "dress_chips";
    wall.add(nested);
    root.add(dress, wall);

    tagCollision(root);

    expect(dress.userData.collision).toBe(false);
    expect(nested.userData.collision).toBe(false);
    expect(wall.userData.collision).toBeUndefined();
  });
});

describe("buildPlaceholder", () => {
  const manifest = loadManifest("store");
  const group = buildPlaceholder(manifest);
  const meshes = group.children.filter((child): child is Mesh => child instanceof Mesh);

  test("builds a floor plus one box per occluding landmark", () => {
    const occluders = manifest.landmarks.filter((landmark) => landmark.occludes).map((l) => l.id);

    expect(meshes.map((mesh) => mesh.name).sort()).toEqual(["floor", ...occluders].sort());
  });

  test("places each box at the centre of its landmark bounds", () => {
    const shelf = manifest.landmarks.find((landmark) => landmark.id === "shelf_a");
    const mesh = meshes.find((candidate) => candidate.name === "shelf_a");
    if (!shelf || !mesh) throw new Error("shelf_a missing");

    expect(mesh.position.x).toBeCloseTo((shelf.bounds.min[0] + shelf.bounds.max[0]) / 2);
    expect(mesh.position.y).toBeCloseTo((shelf.bounds.min[1] + shelf.bounds.max[1]) / 2);
    expect(mesh.position.z).toBeCloseTo((shelf.bounds.min[2] + shelf.bounds.max[2]) / 2);
  });

  test("sizes the floor from the manifest interior", () => {
    const floor = meshes.find((mesh) => mesh.name === "floor");
    const params = (floor?.geometry as { parameters?: { width: number; height: number } }).parameters;

    expect(params).toEqual({ width: 9, height: 7, widthSegments: 1, heightSegments: 1 });
  });

  test("omits the floor when the manifest has no interior", () => {
    const { interior: _interior, ...withoutInterior } = manifest;

    const names = buildPlaceholder(withoutInterior).children.map((child) => child.name);

    expect(names).not.toContain("floor");
  });
});
