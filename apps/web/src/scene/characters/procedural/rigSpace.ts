import type { Vec3 } from "@rashomon/engine";
import { Matrix4, Quaternion, Vector3, type Object3D } from "three";

export type ActorFrame = {
  readonly position: Vec3;
  readonly yaw: number;
};

export const RIG_UP: Readonly<Vector3> = new Vector3(0, 1, 0);
export const RIG_FORWARD: Readonly<Vector3> = new Vector3(0, 0, 1);

const chain = new Matrix4();
const scratchPosition = new Vector3();
const scratchScale = new Vector3();
const scratchQuaternion = new Quaternion();
const parentQuaternion = new Quaternion();
const parentInverse = new Quaternion();

export function rigMatrix(object: Object3D, root: Object3D, out: Matrix4): Matrix4 {
  out.identity();
  let node: Object3D | null = object;
  while (node) {
    node.updateMatrix();
    out.premultiply(node.matrix);
    if (node === root) break;
    node = node.parent;
  }
  return out;
}

export function rigPosition(object: Object3D, root: Object3D, out: Vector3): Vector3 {
  rigMatrix(object, root, chain).decompose(out, scratchQuaternion, scratchScale);
  return out;
}

export function rigQuaternion(object: Object3D, root: Object3D, out: Quaternion): Quaternion {
  rigMatrix(object, root, chain).decompose(scratchPosition, out, scratchScale);
  return out;
}

export function rotateInRig(bone: Object3D, root: Object3D, delta: Quaternion): void {
  const parent = bone === root ? null : bone.parent;
  if (parent) rigQuaternion(parent, root, parentQuaternion);
  else parentQuaternion.identity();
  parentInverse.copy(parentQuaternion).invert();
  bone.quaternion.premultiply(parentInverse.multiply(delta).multiply(parentQuaternion)).normalize();
}

export function toRigSpace(frame: ActorFrame, point: Vec3, out: Vector3): Vector3 {
  out.set(point[0] - frame.position[0], point[1] - frame.position[1], point[2] - frame.position[2]);
  return out.applyAxisAngle(RIG_UP, -frame.yaw);
}
