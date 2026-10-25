import { describe, expect, test } from "vitest";
import { boxFromClick, boxOfLandmark, geometryOfBox, MIN_SIZE, moveBox, resizeBox, withBox } from "./boxes";

describe("boxes", () => {
  test("a floor click centres the default 1 x 1 x 1 footprint on the hit point", () => {
    const box = boxFromClick([3, 0, 4]);

    expect(box).toEqual({ cx: 3, cz: 4, floorY: 0, width: 1, depth: 1, height: 1 });
  });

  test("position is the front-centre at floor level and bounds follow from the size", () => {
    const geometry = geometryOfBox({ cx: 5, cz: 3, floorY: 0, width: 2, depth: 1, height: 1.8 });

    expect(geometry.position).toEqual([5, 0, 2.5]);
    expect(geometry.bounds).toEqual({ min: [4, 0, 2.5], max: [6, 1.8, 3.5] });
  });

  test("a landmark round-trips through its box", () => {
    const box = { cx: 2.25, cz: 6, floorY: 0, width: 1.5, depth: 0.5, height: 2 };
    const landmark = withBox(
      { id: "a", label: "a", aliases: [], kind: "furniture" as const, occludes: true, position: [0, 0, 0] as [number, number, number], bounds: { min: [0, 0, 0] as [number, number, number], max: [0, 0, 0] as [number, number, number] } },
      box,
    );

    expect(boxOfLandmark(landmark)).toEqual(box);
  });

  test("moving keeps the size and resizing keeps the centre", () => {
    const box = boxFromClick([1, 0, 1]);

    expect(moveBox(box, 4, 5)).toMatchObject({ cx: 4, cz: 5, width: 1, depth: 1, height: 1 });
    expect(resizeBox(box, { width: 3, height: 2 })).toMatchObject({ cx: 1, cz: 1, width: 3, depth: 1, height: 2 });
  });

  test("sizes clamp to the minimum and ignore non-finite values", () => {
    const box = boxFromClick([0, 0, 0]);

    expect(resizeBox(box, { width: -2 }).width).toBe(MIN_SIZE);
    expect(resizeBox(box, { depth: Number.NaN }).depth).toBe(1);
  });

  test("coordinates are rounded to the millimetre", () => {
    const geometry = geometryOfBox(boxFromClick([0.1 + 0.2, 0, 1 / 3]));

    expect(geometry.bounds.min[0]).toBe(-0.2);
    expect(geometry.bounds.max[2]).toBe(0.833);
  });
});
