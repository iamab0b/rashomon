import { describe, expect, test } from "vitest";
import { EYE_HEIGHT_M, labelScale, VIEW_HEIGHT, VIEW_WIDTH, viewSpecs } from "./views";

describe("view cameras", () => {
  const interior = { min: [0, 0, 0] as [number, number, number], max: [9, 3, 7] as [number, number, number] };

  test("a top view covers the whole interior at 4:3 and two eye views face each other from opposite corners", () => {
    const [top, a, b] = viewSpecs(interior, 0.2);
    expect(top.halfWidth / top.halfHeight).toBeCloseTo(VIEW_WIDTH / VIEW_HEIGHT, 6);
    expect(top.halfWidth).toBeGreaterThanOrEqual(4.5);
    expect(top.halfHeight).toBeGreaterThanOrEqual(3.5);
    expect([top.position[0], top.position[2]]).toEqual([4.5, 3.5]);
    expect(a.position).toEqual([0.3, 0.2 + EYE_HEIGHT_M, 0.3]);
    expect(b.position).toEqual([8.7, 0.2 + EYE_HEIGHT_M, 6.7]);
    expect(a.target).toEqual(b.target);
  });

  test("labels keep a readable size on screen", () => {
    const [top, eye] = viewSpecs(interior, 0);
    expect((labelScale(top, 40) / (2 * top.halfHeight)) * VIEW_HEIGHT).toBeCloseTo(40, 6);
    expect(labelScale(eye, 40)).toBeGreaterThan(0);
  });
});
