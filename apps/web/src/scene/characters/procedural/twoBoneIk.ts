import { Vector3 } from "three";

export type TwoBoneSolution = {
  readonly elbow: Vector3;
  readonly hand: Vector3;
  readonly reached: boolean;
};

const DEGENERATE_M = 1e-9;
const FALLBACK_AXES: readonly Vector3[] = [new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, 1)];

function perpendicularPart(vector: Vector3, axis: Vector3): Vector3 {
  return vector.clone().sub(axis.clone().multiplyScalar(vector.dot(axis)));
}

function bendDirection(axis: Vector3, pole: Vector3, currentElbow: Vector3): Vector3 {
  for (const candidate of [pole, currentElbow, ...FALLBACK_AXES]) {
    const bend = perpendicularPart(candidate, axis);
    if (bend.length() > DEGENERATE_M) return bend.normalize();
  }
  return new Vector3(0, 1, 0);
}

export function solveTwoBoneIk(
  shoulder: Vector3,
  elbow: Vector3,
  hand: Vector3,
  target: Vector3,
  pole: Vector3,
): TwoBoneSolution {
  const upper = elbow.distanceTo(shoulder);
  const lower = hand.distanceTo(elbow);
  const toTarget = target.clone().sub(shoulder);
  const distance = toTarget.length();
  const axis =
    distance > DEGENERATE_M ? toTarget.divideScalar(distance) : hand.clone().sub(shoulder).normalize();
  const minReach = Math.abs(upper - lower);
  const maxReach = upper + lower;
  const reach = Math.min(maxReach, Math.max(minReach, distance));
  const cosShoulder =
    reach > DEGENERATE_M ? (upper * upper + reach * reach - lower * lower) / (2 * upper * reach) : 1;
  const clampedCos = Math.min(1, Math.max(-1, cosShoulder));
  const sinShoulder = Math.sqrt(1 - clampedCos * clampedCos);
  const bend = bendDirection(axis, pole, elbow.clone().sub(shoulder));
  const solvedElbow = shoulder
    .clone()
    .add(axis.clone().multiplyScalar(upper * clampedCos))
    .add(bend.multiplyScalar(upper * sinShoulder));
  const solvedHand = shoulder.clone().add(axis.clone().multiplyScalar(reach));
  return { elbow: solvedElbow, hand: solvedHand, reached: distance >= minReach && distance <= maxReach };
}
