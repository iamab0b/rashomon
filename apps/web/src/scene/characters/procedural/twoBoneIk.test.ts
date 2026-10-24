import { Vector3 } from "three";
import { describe, expect, test } from "vitest";
import { solveTwoBoneIk } from "./twoBoneIk";

const MM = 1e-3;
const shoulder = new Vector3(0, 1.4, 0);
const elbow = new Vector3(-0.274, 1.4, 0);
const hand = new Vector3(-0.55, 1.4, 0);
const upper = elbow.distanceTo(shoulder);
const lower = hand.distanceTo(elbow);
const pole = new Vector3(-1, -1, 0).normalize();

describe("solveTwoBoneIk", () => {
  test("a reachable target is reached within 1 mm", () => {
    const target = new Vector3(-0.2, 1.0, 0.25);
    const solution = solveTwoBoneIk(shoulder, elbow, hand, target, pole);
    expect(solution.reached).toBe(true);
    expect(solution.hand.distanceTo(target)).toBeLessThan(MM);
  });

  test("bone lengths never change, reachable or not", () => {
    for (const target of [new Vector3(-0.2, 1.0, 0.25), new Vector3(2, 0, 3), new Vector3(0, 1.4, 0.01)]) {
      const solution = solveTwoBoneIk(shoulder, elbow, hand, target, pole);
      expect(solution.elbow.distanceTo(shoulder)).toBeCloseTo(upper, 9);
      expect(solution.hand.distanceTo(solution.elbow)).toBeCloseTo(lower, 9);
    }
  });

  test("an unreachable target gets a straight arm pointing at it, not a stretched one", () => {
    const target = new Vector3(1.5, 0.2, 2);
    const solution = solveTwoBoneIk(shoulder, elbow, hand, target, pole);
    const toward = target.clone().sub(shoulder).normalize();
    expect(solution.reached).toBe(false);
    expect(solution.hand.distanceTo(shoulder)).toBeCloseTo(upper + lower, 9);
    expect(solution.hand.clone().sub(shoulder).normalize().dot(toward)).toBeCloseTo(1, 9);
    expect(solution.elbow.clone().sub(shoulder).normalize().dot(toward)).toBeCloseTo(1, 9);
  });

  test("the elbow bends toward the pole", () => {
    const target = new Vector3(0, 1.0, 0.3);
    const solution = solveTwoBoneIk(shoulder, elbow, hand, target, pole);
    const axis = target.clone().sub(shoulder).normalize();
    const bend = solution.elbow.clone().sub(shoulder);
    const offAxis = bend.sub(axis.multiplyScalar(bend.dot(axis)));
    expect(offAxis.dot(pole)).toBeGreaterThan(0);
  });

  test("it does not mutate its inputs", () => {
    const before = [shoulder, elbow, hand, pole].map((vector) => vector.clone());
    solveTwoBoneIk(shoulder, elbow, hand, new Vector3(-0.3, 1.1, 0.2), pole);
    [shoulder, elbow, hand, pole].forEach((vector, index) => expect(vector.equals(before[index] as Vector3)).toBe(true));
  });
});
