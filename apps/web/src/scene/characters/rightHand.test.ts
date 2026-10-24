import { describe, expect, test } from "vitest";
import { Bone, BufferGeometry, Skeleton, SkinnedMesh } from "three";
import { findPrimarySkinnedMesh, findRightHand, RIGHT_HAND_BONE } from "./rigs";

const named = (name: string): Bone => {
  const bone = new Bone();
  bone.name = name;
  return bone;
};

function fakeRig() {
  const hips = named("mixamorigHips");
  const hand = named(RIGHT_HAND_BONE);
  hips.add(hand);
  const duplicateHips = named("mixamorigHips");
  const duplicateHand = named(RIGHT_HAND_BONE);
  duplicateHips.add(duplicateHand);
  hips.add(duplicateHips);

  const duplicateMesh = new SkinnedMesh(new BufferGeometry());
  duplicateMesh.skeleton = new Skeleton([duplicateHips, duplicateHand]);
  const primaryMesh = new SkinnedMesh(new BufferGeometry());
  primaryMesh.skeleton = new Skeleton([hips, hand]);
  return { hand, duplicateHand, primaryMesh, duplicateMesh };
}

describe("findRightHand", () => {
  test("finds the hand on the primary skeleton, not on the duplicate chain", () => {
    const { hand, duplicateHand, primaryMesh, duplicateMesh } = fakeRig();
    const primary = findPrimarySkinnedMesh([duplicateMesh, primaryMesh]);
    expect(primary).toBe(primaryMesh);
    expect(findRightHand(primary!)).toBe(hand);
    expect(findRightHand(primary!)).not.toBe(duplicateHand);
  });

  test("is undefined when the skeleton has no right hand", () => {
    const mesh = new SkinnedMesh(new BufferGeometry());
    mesh.skeleton = new Skeleton([named("mixamorigHips")]);
    expect(findRightHand(mesh)).toBeUndefined();
  });
});
