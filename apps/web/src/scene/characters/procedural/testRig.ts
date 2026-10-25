import { AnimationClip, Bone, Group, Quaternion, QuaternionKeyframeTrack, Vector3 } from "three";
import { MIXAMO_UNIT_SCALE } from "../rigs";

export type SyntheticSkeleton = {
  readonly root: Group;
  readonly bones: readonly Bone[];
};

type BoneSpec = readonly [name: string, parent: string | null, offset: readonly [number, number, number]];

const SPECS: readonly BoneSpec[] = [
  ["mixamorigHips", null, [0, 100, 0]],
  ["mixamorigSpine2", "mixamorigHips", [0, 35, -4]],
  ["mixamorigNeck", "mixamorigSpine2", [0, 15, 1]],
  ["mixamorigHead", "mixamorigNeck", [0, 10, 3]],
  ["mixamorigRightShoulder", "mixamorigSpine2", [-6, 9, -2]],
  ["mixamorigRightArm", "mixamorigRightShoulder", [-13, 0, 0]],
  ["mixamorigRightForeArm", "mixamorigRightArm", [-27.4, 0, 0]],
  ["mixamorigRightHand", "mixamorigRightForeArm", [-27.6, 0, 0]],
];

export function syntheticSkeleton(): SyntheticSkeleton {
  const root = new Group();
  root.scale.setScalar(MIXAMO_UNIT_SCALE);
  const byName = new Map<string, Bone>();
  for (const [name, parentName, [x, y, z]] of SPECS) {
    const bone = new Bone();
    bone.name = name;
    bone.position.set(x, y, z);
    const parent = parentName ? byName.get(parentName) : root;
    parent?.add(bone);
    byName.set(name, bone);
  }
  return { root, bones: [...byName.values()] };
}

const SWING_KEYS = 9;
const SWUNG_BONES: readonly (readonly [string, Vector3])[] = [
  ["mixamorigNeck", new Vector3(1, 0, 0)],
  ["mixamorigHead", new Vector3(0, 1, 0)],
  ["mixamorigRightArm", new Vector3(0, 0, 1)],
];

export function swingClip(name: string, duration: number, amplitude: number): AnimationClip {
  const times = Array.from({ length: SWING_KEYS }, (_, index) => (index / (SWING_KEYS - 1)) * duration);
  const tracks = SWUNG_BONES.map(([bone, axis], order) => {
    const values = times.flatMap((time) => {
      const angle = amplitude * Math.sin((2 * Math.PI * time) / duration + order);
      return new Quaternion().setFromAxisAngle(axis, angle).toArray();
    });
    return new QuaternionKeyframeTrack(`${bone}.quaternion`, times, values);
  });
  return new AnimationClip(name, duration, tracks);
}
