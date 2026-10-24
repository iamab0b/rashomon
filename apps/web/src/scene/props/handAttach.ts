import { Quaternion, Vector3, type Object3D } from "three";

const handPosition = new Vector3();
const handQuaternion = new Quaternion();
const offset = new Vector3();

export function poseFromHand(hand: Object3D, gripOffset: readonly [number, number, number], target: Object3D): void {
  hand.updateWorldMatrix(true, false);
  hand.getWorldPosition(handPosition);
  hand.getWorldQuaternion(handQuaternion);
  offset.set(gripOffset[0], gripOffset[1], gripOffset[2]).applyQuaternion(handQuaternion);
  target.position.copy(handPosition).add(offset);
  target.quaternion.copy(handQuaternion);
  target.scale.setScalar(1);
}
