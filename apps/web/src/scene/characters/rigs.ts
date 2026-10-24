import type { Actor } from "@rashomon/schema";
import { Bone, SkinnedMesh, type Group, type Object3D } from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";

export type Rig = Actor["rig"];

export const MIXAMO_UNIT_SCALE = 0.01;
export const HIP_BONE_SUFFIX = "Hips";
export const RIGHT_HAND_BONE = "mixamorigRightHand";

const RIG_URLS: Readonly<Record<Rig, string>> = {
  mixamo_ybot: "/characters/ybot.fbx",
  mixamo_xbot: "/characters/xbot.fbx",
};

const rigCache = new Map<Rig, Promise<Group>>();

export function loadRig(rig: Rig): Promise<Group> {
  const cached = rigCache.get(rig);
  if (cached) return cached;
  const pending = new FBXLoader().loadAsync(RIG_URLS[rig]);
  rigCache.set(rig, pending);
  pending.catch(() => rigCache.delete(rig));
  return pending;
}

export function findSkinnedMeshes(root: Object3D): SkinnedMesh[] {
  const meshes: SkinnedMesh[] = [];
  root.traverse((object) => {
    if (object instanceof SkinnedMesh) meshes.push(object);
  });
  return meshes;
}

function isSubBone(bone: Bone): boolean {
  return bone.parent instanceof Bone && bone.parent.name === bone.name;
}

export function findPrimarySkinnedMesh(meshes: readonly SkinnedMesh[]): SkinnedMesh | undefined {
  return meshes.find((mesh) => {
    const rootBone = mesh.skeleton.bones[0];
    return rootBone !== undefined && !isSubBone(rootBone);
  });
}

export function findRightHand(mesh: SkinnedMesh): Bone | undefined {
  return mesh.skeleton.bones.find((bone) => bone.name === RIGHT_HAND_BONE);
}

export function findHipBone(mesh: SkinnedMesh): Bone | undefined {
  return mesh.skeleton.bones.find((bone) => bone.name.endsWith(HIP_BONE_SUFFIX));
}
