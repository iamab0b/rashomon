import { Quaternion, Vector3, type Bone, type Object3D } from "three";
import type { CharacterHandle } from "../Character";
import { findPrimarySkinnedMesh, RIGHT_HAND_BONE } from "../rigs";
import { RIG_FORWARD, rigQuaternion } from "./rigSpace";

export const NECK_BONE = "mixamorigNeck";
export const HEAD_BONE = "mixamorigHead";
export const CHEST_BONE = "mixamorigSpine2";
export const RIGHT_ARM_BONE = "mixamorigRightArm";
export const RIGHT_FOREARM_BONE = "mixamorigRightForeArm";

export type ProceduralRig = {
  readonly root: Object3D;
  readonly chest: Bone;
  readonly neck: Bone;
  readonly head: Bone;
  readonly rightArm: Bone;
  readonly rightForeArm: Bone;
  readonly rightHand: Bone;
  readonly headForward: Vector3;
  readonly clipPose: readonly (readonly [Bone, Quaternion])[];
};

export function buildProceduralRig(root: Object3D, bones: readonly Bone[]): ProceduralRig | null {
  const named = (name: string) => bones.find((bone) => bone.name === name);
  const chest = named(CHEST_BONE);
  const neck = named(NECK_BONE);
  const head = named(HEAD_BONE);
  const rightArm = named(RIGHT_ARM_BONE);
  const rightForeArm = named(RIGHT_FOREARM_BONE);
  const rightHand = named(RIGHT_HAND_BONE);
  if (!chest || !neck || !head || !rightArm || !rightForeArm || !rightHand) return null;
  const headRest = rigQuaternion(head, root, new Quaternion());
  const headForward = RIG_FORWARD.clone().applyQuaternion(headRest.invert());
  const clipPose = [neck, head, rightArm, rightForeArm].map((bone) => [bone, bone.quaternion.clone()] as const);
  return { root, chest, neck, head, rightArm, rightForeArm, rightHand, headForward, clipPose };
}

export function rigFromCharacter(handle: CharacterHandle): ProceduralRig | null {
  const mesh = findPrimarySkinnedMesh(handle.skinnedMeshes);
  return mesh ? buildProceduralRig(handle.root, mesh.skeleton.bones) : null;
}

export function restoreClipPose(rig: ProceduralRig): void {
  for (const [bone, pose] of rig.clipPose) bone.quaternion.copy(pose);
}

export function captureClipPose(rig: ProceduralRig): void {
  for (const [bone, pose] of rig.clipPose) pose.copy(bone.quaternion);
}
