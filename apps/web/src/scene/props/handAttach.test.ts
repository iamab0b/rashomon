import { describe, expect, test } from "vitest";
import { Bone, Group, Object3D, Quaternion, Vector3 } from "three";
import { poseFromHand } from "./handAttach";

describe("poseFromHand", () => {
  test("under a 0.01 scale parent the prop lands at the bone's world position plus the rotated grip at scale 1", () => {
    const parent = new Group();
    parent.scale.setScalar(0.01);
    parent.position.set(2, 0, 3);
    parent.rotation.y = Math.PI / 2;
    const bone = new Bone();
    bone.position.set(100, 50, 0);
    bone.rotation.x = Math.PI / 2;
    parent.add(bone);
    const target = new Object3D();
    target.scale.set(7, 7, 7);

    poseFromHand(bone, [0, 0, -0.1], target);

    expect(target.position.x).toBeCloseTo(2, 6);
    expect(target.position.y).toBeCloseTo(0.6, 6);
    expect(target.position.z).toBeCloseTo(2, 6);
    const expected = new Quaternion()
      .setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2)
      .multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 2));
    expect(target.quaternion.angleTo(expected)).toBeLessThan(1e-6);
    target.updateWorldMatrix(true, false);
    const worldScale = target.getWorldScale(new Vector3());
    expect(worldScale.x).toBeCloseTo(1, 6);
    expect(worldScale.y).toBeCloseTo(1, 6);
    expect(worldScale.z).toBeCloseTo(1, 6);
  });

  test("it follows the bone when the bone moves, with no state kept between calls", () => {
    const parent = new Group();
    parent.scale.setScalar(0.01);
    const bone = new Bone();
    parent.add(bone);
    const target = new Object3D();
    bone.position.set(100, 0, 0);
    poseFromHand(bone, [0, 0, 0], target);
    expect(target.position.x).toBeCloseTo(1, 6);
    bone.position.set(0, 200, 0);
    poseFromHand(bone, [0, 0, 0], target);
    expect(target.position.x).toBeCloseTo(0, 6);
    expect(target.position.y).toBeCloseTo(2, 6);
  });
});
