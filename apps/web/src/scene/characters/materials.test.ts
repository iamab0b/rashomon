import { BoxGeometry, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial } from "three";
import { afterEach, describe, expect, test, vi as vitest } from "vitest";
import { disposeMaterials, ownMaterials, replaceMaterials, setOpacity } from "./materials";


function rig(): { root: Group; shared: MeshStandardMaterial; meshes: Mesh[] } {
  const shared = new MeshStandardMaterial({ color: "#336699" });
  const a = new Mesh(new BoxGeometry(), shared);
  const b = new Mesh(new BoxGeometry(), [shared, new MeshBasicMaterial()]);
  const root = new Group();
  root.add(a, b);
  return { root, shared, meshes: [a, b] };
}

afterEach(() => vitest.restoreAllMocks());

describe("ownMaterials", () => {
  test("gives every mesh its own clone and returns exactly those clones", () => {
    const { root, shared, meshes } = rig();

    const owned = ownMaterials(root);

    expect(owned).toHaveLength(3);
    expect(owned).not.toContain(shared);
    expect((meshes[0]?.material as MeshStandardMaterial)).not.toBe(shared);
    expect(owned).toContain(meshes[0]?.material);
    expect(Array.isArray(meshes[1]?.material)).toBe(true);
  });

  test("two clones of one rig do not share opacity", () => {
    const first = rig();
    const second = rig();
    ownMaterials(first.root);
    ownMaterials(second.root);

    setOpacity(first.root, 0.4);

    expect((second.meshes[0]?.material as MeshStandardMaterial).opacity).toBe(1);
  });
});

describe("disposeMaterials", () => {
  test("disposes every owned material, and never the shared source", () => {
    const { root, shared } = rig();
    const owned = ownMaterials(root);
    const spies = owned.map((material) => vitest.spyOn(material, "dispose"));
    const sourceSpy = vitest.spyOn(shared, "dispose");

    disposeMaterials(owned);

    spies.forEach((spy) => expect(spy).toHaveBeenCalledTimes(1));
    expect(sourceSpy).not.toHaveBeenCalled();
  });
});

describe("replaceMaterials", () => {
  test("disposes the owned clones it replaces and installs the ghost material", () => {
    const { root, meshes } = rig();
    const owned = ownMaterials(root);
    const spies = owned.map((material) => vitest.spyOn(material, "dispose"));
    const ghost = new MeshBasicMaterial({ wireframe: true });
    const ghostSpy = vitest.spyOn(ghost, "dispose");

    replaceMaterials(root, ghost);

    spies.forEach((spy) => expect(spy).toHaveBeenCalledTimes(1));
    expect(ghostSpy).not.toHaveBeenCalled();
    expect(meshes[0]?.material).toBe(ghost);
    expect(meshes[1]?.material).toEqual([ghost, ghost]);
    expect(meshes[0]?.castShadow).toBe(false);
  });

  test("does not dispose the replacement material even if it was already installed", () => {
    const { root } = rig();
    const ghost = new MeshBasicMaterial();
    replaceMaterials(root, ghost);
    const spy = vitest.spyOn(ghost, "dispose");

    replaceMaterials(root, ghost);

    expect(spy).not.toHaveBeenCalled();
  });
});
