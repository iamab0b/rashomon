import { describe, expect, test } from "vitest";
import { framePose } from "./framing";

describe("framePose", () => {
  test("looks at the centre from far enough to fit the bounds", () => {
    const pose = framePose({ min: [0, 0, 0], max: [9, 3, 7] }, 50);
    expect(pose.lookAt).toEqual([4.5, 1.5, 3.5]);
    const radius = Math.hypot(9, 3, 7) / 2;
    const distance = Math.hypot(pose.position[0] - 4.5, pose.position[1] - 1.5, pose.position[2] - 3.5);
    expect(distance).toBeCloseTo(radius / Math.sin((25 * Math.PI) / 180), 6);
    expect(pose.position[1]).toBeGreaterThan(1.5);
    expect(pose.far).toBe(1000);
  });

  test("a huge or distant scan pushes the far plane out", () => {
    const pose = framePose({ min: [5000, -2000, 120000], max: [5900, -2000, 120900] }, 50);
    expect(pose.lookAt).toEqual([5450, -2000, 120450]);
    expect(pose.far).toBeGreaterThan(2000);
  });
});
