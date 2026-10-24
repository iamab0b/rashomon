import { storeScene } from "@rashomon/schema/fixtures";
import { PerspectiveCamera, Vector3 } from "three";
import { describe, expect, test } from "vitest";
import { landmarkOccluders } from "./landmarkOccluders";
import { CHEST_HEIGHT_M, EYE_HEIGHT_M } from "./povSightline";
import { frustumOf, isMeshVisible, isPointOccluded, isPointVisible } from "./visibility";

const occluders = landmarkOccluders(storeScene);
const CLERK_FEET: [number, number, number] = [8.85, 0, 2.5];
const AISLE_CHIPS: [number, number, number] = [1.5, 0, 3.5];
const WINDOW_FRONT: [number, number, number] = [4.5, 0, 1.0];

function eyeAt(feet: [number, number, number]): Vector3 {
  return new Vector3(feet[0], EYE_HEIGHT_M, feet[2]);
}

function clerkChest(): Vector3 {
  return new Vector3(CLERK_FEET[0], CHEST_HEIGHT_M, CLERK_FEET[2]);
}

function dimmedClerkFrom(feet: [number, number, number]): boolean {
  const eye = eyeAt(feet);
  const chest = clerkChest();
  const camera = new PerspectiveCamera(50, 16 / 9, 0.1, 100);
  camera.position.copy(eye);
  camera.lookAt(chest);
  camera.updateMatrixWorld();
  return !isPointVisible(eye, chest, frustumOf(camera), occluders.boxes);
}

describe("landmark occluder set", () => {
  test("holds one box for each manifest landmark that occludes", () => {
    const expected = storeScene.landmarks.filter((landmark) => landmark.occludes).map((landmark) => landmark.id);

    expect(occluders.boxes.map((box) => box.name).sort()).toEqual([...expected].sort());
    expect(expected).toEqual(expect.arrayContaining(["counter", "shelf_a", "shelf_b", "cooler"]));
  });

  test("is created once per manifest", () => {
    expect(landmarkOccluders(storeScene)).toBe(occluders);
  });

  test("boxes match the landmark bounds", () => {
    const counter = storeScene.landmarks.find((landmark) => landmark.id === "counter");
    const box = occluders.boxFor("counter");

    expect(counter).toBeDefined();
    expect(box).not.toBeNull();
    expect(box?.position.toArray()).toEqual([8.1, 0.5, 2.5]);
    expect(occluders.boxFor("register")).toBeNull();
  });
});

describe("POV dimming from landmark occluders matches the gate's e5 verdict", () => {
  test("from aisle_chips the clerk behind the counter is dimmed", () => {
    expect(dimmedClerkFrom(AISLE_CHIPS)).toBe(true);
    expect(isPointOccluded(eyeAt(AISLE_CHIPS), clerkChest(), occluders.boxes)).toBe(true);
  });

  test("from window_front the clerk is not dimmed", () => {
    expect(dimmedClerkFrom(WINDOW_FRONT)).toBe(false);
    expect(isPointOccluded(eyeAt(WINDOW_FRONT), clerkChest(), occluders.boxes)).toBe(false);
  });

  test("a landmark does not occlude itself when it is the dimming target", () => {
    const eye = eyeAt(WINDOW_FRONT);
    const camera = new PerspectiveCamera(50, 16 / 9, 0.1, 100);
    camera.position.copy(eye);
    camera.lookAt(8.1, 0.5, 2.5);
    camera.updateMatrixWorld();
    const box = occluders.boxFor("counter");
    if (!box) throw new Error("no counter box");

    expect(isMeshVisible(eye, box, frustumOf(camera), occluders.boxes, box)).toBe(true);
  });
});
