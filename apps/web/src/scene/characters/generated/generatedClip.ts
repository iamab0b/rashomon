import {
  AnimationClip,
  Quaternion,
  QuaternionKeyframeTrack,
  Vector3,
  VectorKeyframeTrack,
  type KeyframeTrack,
  type Object3D,
} from "three";
import { HIPS_POSITION_TRACK, prepareClip } from "../clips";

export const HIPS_NODE = "mixamorigHips";
export const HIPS_QUATERNION_TRACK = "mixamorigHips.quaternion";

const QUATERNION_STRIDE = 4;
const VECTOR3_STRIDE = 3;

export type GltfLike = {
  readonly scene: Object3D;
  readonly animations: readonly AnimationClip[];
};

export function hipsParentRotation(root: Object3D): Quaternion {
  const hips = root.getObjectByName(HIPS_NODE);
  if (!hips) throw new Error(`generated motion has no ${HIPS_NODE} node`);
  const chain: Object3D[] = [];
  for (let node = hips.parent; node && node !== root; node = node.parent) chain.unshift(node);
  return chain.reduce((acc, node) => acc.multiply(node.quaternion), new Quaternion());
}

function rebaseQuaternions(track: KeyframeTrack, parent: Quaternion): KeyframeTrack {
  const values = Array.from(track.values);
  const q = new Quaternion();
  for (let i = 0; i < values.length; i += QUATERNION_STRIDE) {
    q.fromArray(values, i).premultiply(parent).toArray(values, i);
  }
  return new QuaternionKeyframeTrack(track.name, Array.from(track.times), values);
}

function rebasePositions(track: KeyframeTrack, parent: Quaternion): KeyframeTrack {
  const values = Array.from(track.values);
  const v = new Vector3();
  for (let i = 0; i < values.length; i += VECTOR3_STRIDE) {
    v.fromArray(values, i).applyQuaternion(parent).toArray(values, i);
  }
  return new VectorKeyframeTrack(track.name, Array.from(track.times), values);
}

function rebaseHips(track: KeyframeTrack, parent: Quaternion): KeyframeTrack {
  if (track.name === HIPS_QUATERNION_TRACK) return rebaseQuaternions(track, parent);
  if (track.name === HIPS_POSITION_TRACK) return rebasePositions(track, parent);
  return track;
}

function leafNames(root: Object3D): ReadonlySet<string> {
  const leaves = new Set<string>();
  root.traverse((node) => {
    if (node !== root && node.children.length === 0) leaves.add(node.name);
  });
  return leaves;
}

export function prepareGeneratedClip(name: string, gltf: GltfLike): AnimationClip {
  const source = gltf.animations[0];
  if (!source) throw new Error(`generated motion for ${name} has no animation`);
  const parent = hipsParentRotation(gltf.scene);
  const leaves = leafNames(gltf.scene);
  const tracks = source.tracks
    .filter((track) => !leaves.has(track.name.split(".")[0] ?? ""))
    .map((track) => rebaseHips(track, parent));
  return prepareClip(name, new AnimationClip(name, source.duration, tracks));
}
