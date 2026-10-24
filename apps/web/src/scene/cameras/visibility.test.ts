import { storeScene } from "@rashomon/schema/fixtures";
import { Mesh, PerspectiveCamera, Vector3, type Object3D } from "three";
import { describe, expect, test } from "vitest";
import { buildPlaceholder } from "../loaders/scene";
import { frustumOf, isMeshVisible, isPointOccluded, isPointVisible } from "./visibility";

const model = buildPlaceholder(storeScene);
model.updateMatrixWorld(true);
const meshes = new Map<string, Mesh>();
model.traverse((object: Object3D) => {
  if (object instanceof Mesh) meshes.set(object.name, object);
});
const occluders = [...meshes.values()].filter((mesh) => mesh.name !== "floor");

function mesh(name: string): Mesh {
  const found = meshes.get(name);
  if (!found) throw new Error(`no ${name} mesh`);
  return found;
}

function cameraAt(eye: [number, number, number], target: [number, number, number]): PerspectiveCamera {
  const camera = new PerspectiveCamera(50, 16 / 9, 0.1, 100);
  camera.position.set(...eye);
  camera.lookAt(...target);
  camera.updateMatrixWorld();
  return camera;
}

const CHIPS_AISLE_EYE: [number, number, number] = [1.5, 1.6, 3.5];
const WINDOW_EYE: [number, number, number] = [4.5, 1.6, 1.0];
const SUSPECT_CHEST: [number, number, number] = [7.2, 1.2, 2.5];

describe("what the witness could see, on the store placeholder", () => {
  test("from the chips aisle, shelf_a blocks the suspect at the counter (the planted e5 case)", () => {
    const camera = cameraAt(CHIPS_AISLE_EYE, SUSPECT_CHEST);
    const frustum = frustumOf(camera);
    const eye = new Vector3(...CHIPS_AISLE_EYE);

    expect(isPointVisible(eye, new Vector3(...SUSPECT_CHEST), frustum, occluders)).toBe(false);
    expect(isMeshVisible(eye, mesh("counter"), frustum, occluders)).toBe(false);
    expect(isMeshVisible(eye, mesh("shelf_a"), frustum, occluders)).toBe(true);
  });

  test("from the front window, the suspect and the counter are clear (the corrected case)", () => {
    const camera = cameraAt(WINDOW_EYE, SUSPECT_CHEST);
    const frustum = frustumOf(camera);
    const eye = new Vector3(...WINDOW_EYE);

    expect(isPointVisible(eye, new Vector3(...SUSPECT_CHEST), frustum, occluders)).toBe(true);
    expect(isMeshVisible(eye, mesh("counter"), frustum, occluders)).toBe(true);
  });

  test("a mesh entirely outside the frustum is not visible even when nothing blocks it", () => {
    const camera = cameraAt(WINDOW_EYE, SUSPECT_CHEST);
    const frustum = frustumOf(camera);

    expect(isMeshVisible(new Vector3(...WINDOW_EYE), mesh("shelf_a"), frustum, occluders)).toBe(false);
  });

  test("a mesh partly in the frustum counts as in view", () => {
    const camera = cameraAt([4.5, 1.6, 4.0], [4.5, 1.0, 6.7]);
    const frustum = frustumOf(camera);

    expect(isMeshVisible(new Vector3(4.5, 1.6, 4.0), mesh("cooler"), frustum, occluders)).toBe(true);
  });

  test("hits on the target mesh itself do not count as occlusion", () => {
    const eye = new Vector3(...WINDOW_EYE);
    const counterFace = new Vector3(8.1, 0.5, 2.5);

    expect(isPointOccluded(eye, counterFace, occluders, mesh("counter"))).toBe(false);
    expect(isPointOccluded(eye, counterFace, occluders)).toBe(true);
  });

  test("a point at the eye is never occluded", () => {
    const eye = new Vector3(...CHIPS_AISLE_EYE);

    expect(isPointOccluded(eye, eye.clone(), occluders)).toBe(false);
  });
});
