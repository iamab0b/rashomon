import { roomScene, storeScene } from "@rashomon/schema/fixtures";
import { Mesh, MeshBasicMaterial, MeshStandardMaterial, type Object3D } from "three";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { roomAlignment } from "../loaders/roomFixture";
import { loadScene } from "../loaders/scene";
import { meshFixtureFor } from "./liveSceneFixture";

const requested = vi.hoisted(() => [] as string[]);

vi.mock("three/examples/jsm/loaders/GLTFLoader.js", async () => {
  const three = await import("three");
  class GLTFLoader {
    register() {
      return this;
    }
    loadAsync(url: string) {
      requested.push(url);
      const scene = new three.Group();
      scene.add(new three.Mesh(new three.BoxGeometry(1, 1, 1), new three.MeshStandardMaterial()));
      return Promise.resolve({ scene });
    }
  }
  return { GLTFLoader };
});

function meshesOf(root: Object3D): Mesh[] {
  const found: Mesh[] = [];
  root.traverse((object) => {
    if (object instanceof Mesh) found.push(object);
  });
  return found;
}

beforeEach(() => {
  requested.length = 0;
});

describe("the live scene's mesh", () => {
  it("a room_v1 session requests the room scan, aligned by the sidecar and unlit", async () => {
    const loaded = await loadScene(meshFixtureFor("store", "room_v1")!, false);

    expect(requested).toEqual([roomScene.meshUrl]);
    expect(loaded.manifest).toBe(roomScene);
    expect(loaded.isPlaceholder).toBe(false);
    expect(loaded.model.name).toBe("room_v1_aligned");
    expect(loaded.model.position.toArray()).toEqual([...roomAlignment.translation]);
    expect(meshesOf(loaded.model).every((mesh) => mesh.material instanceof MeshBasicMaterial)).toBe(true);
  });

  it("a store_v1 session requests the store mesh, lit, with no alignment", async () => {
    const loaded = await loadScene(meshFixtureFor("store", "store_v1")!, false);

    expect(requested).toEqual([storeScene.meshUrl]);
    expect(loaded.manifest).toBe(storeScene);
    expect(loaded.model.name).not.toBe("store_v1_aligned");
    expect(loaded.model.position.toArray()).toEqual([0, 0, 0]);
    expect(meshesOf(loaded.model).every((mesh) => mesh.material instanceof MeshStandardMaterial)).toBe(true);
  });

  it("before a live row arrives the mesh is the page's fixture", async () => {
    await loadScene(meshFixtureFor("store", null)!, false);
    expect(requested).toEqual([storeScene.meshUrl]);
  });
});
